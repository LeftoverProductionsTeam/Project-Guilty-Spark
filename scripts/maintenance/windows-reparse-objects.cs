using System;
using System.IO;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

// Separate native no-follow admission for link objects. This never opens their
// targets, mutates a target, or changes the ordinary-file retirement primitive.
public static class SparkReparseObjects {
    const uint Attributes = 0x80, GenericRead = 0x80000000, DeleteAccess = 0x10000;
    const uint ShareRead = 1, ShareWrite = 2, ShareDelete = 4;
    const uint OpenExisting = 3, BackupSemantics = 0x02000000, OpenReparsePoint = 0x00200000;
    const uint ReparseAttribute = 0x400, DirectoryAttribute = 0x10, GetReparsePoint = 0x900A8;
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint VolumeSerial, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)] struct Disposition { [MarshalAs(UnmanagedType.Bool)] public bool Delete; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint sharing, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info value);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,uint inputSize,byte[] output,uint outputSize,out uint returned,IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int kind,ref Disposition value,uint size);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct FindData {
        public uint Attributes, CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,SizeHigh,SizeLow,Tag,Reserved;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Name;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)] public string AlternateName;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstFileW(string pattern,out FindData data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextFileW(IntPtr search,out FindData data);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool FindClose(IntPtr search);
    public sealed class Snapshot {
        public string path, dev, ino, rawBase64, rawSha256, lastWriteFileTime;
        public uint attributes, tag;
        public int rawBytes;
        public bool directory, followedTarget = false;
    }
    public sealed class DirectorySnapshot { public string path,dev,ino,creationFileTime;public uint attributes; }
    public sealed class Inventory { public List<string> links=new List<string>();public List<DirectorySnapshot> directoryEntries=new List<DirectorySnapshot>();public DirectorySnapshot workspaceIdentity;public int directories,regularFiles;public bool noFollow=true; }
    static Dictionary<string,DirectorySnapshot> directoryClaims;
    static DirectorySnapshot DirectoryIdentity(string full,Info info) { return new DirectorySnapshot{path=full,dev=info.VolumeSerial.ToString(),ino=(((ulong)info.IndexHigh<<32)|info.IndexLow).ToString(),creationFileTime=(((ulong)info.CreationHigh<<32)|info.CreationLow).ToString(),attributes=info.Attributes}; }
    static bool SameDirectory(DirectorySnapshot a,DirectorySnapshot b) { return a.dev==b.dev&&a.ino==b.ino&&a.creationFileTime==b.creationFileTime&&a.attributes==b.attributes; }
    static string Native(string full) { return full.StartsWith(@"\\?\",StringComparison.Ordinal)?full:full.StartsWith(@"\\",StringComparison.Ordinal)?@"\\?\UNC\"+full.Substring(2):@"\\?\"+full; }
    static string Sha(byte[] value) { using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(value)).Replace("-","").ToLowerInvariant(); }
    static Info ReadInfo(SafeFileHandle handle) { Info info;if(!GetFileInformationByHandle(handle,out info))throw new Win32Exception(Marshal.GetLastWin32Error(),"Link metadata read failed");return info; }
    static SafeFileHandle Open(string full,uint access,uint share) {
        var handle=CreateFileW(Native(full),access,share,IntPtr.Zero,OpenExisting,BackupSemantics|OpenReparsePoint,IntPtr.Zero);
        if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new Win32Exception(error,"No-follow object open failed: "+full);}return handle;
    }
    static string Full(string value) { return Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar); }
    static string Admitted(string workspace,string name) {
        string root=Full(workspace), full=Full(name), local=Path.Combine(root,".local")+Path.DirectorySeparatorChar;
        if(!full.StartsWith(local,StringComparison.OrdinalIgnoreCase)||full.IndexOf(':',2)>=0)throw new InvalidOperationException("Object is outside the explicit obsolete local tree");return full;
    }
    static List<SafeFileHandle> Parents(string workspace,string name) {
        var guards=new List<SafeFileHandle>();string root=Full(workspace), full=Path.GetDirectoryName(name);
        var names=new List<string>();while(full!=null&&full.Length>=root.Length){names.Add(full);if(String.Equals(full,root,StringComparison.OrdinalIgnoreCase))break;full=Path.GetDirectoryName(full);}
        if(names.Count==0||!String.Equals(names[names.Count-1],root,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Parent chain leaves workspace");
        names.Reverse();try{foreach(string parent in names){var guard=Open(parent,GenericRead,ShareRead|ShareWrite);guards.Add(guard);var info=ReadInfo(guard);if((info.Attributes&ReparseAttribute)!=0||(info.Attributes&DirectoryAttribute)==0)throw new InvalidOperationException("Parent is linked or not a directory: "+parent);if(directoryClaims!=null){DirectorySnapshot expected;if(!directoryClaims.TryGetValue(parent,out expected)||!SameDirectory(expected,DirectoryIdentity(parent,info)))throw new InvalidOperationException("Directory parent identity changed: "+parent);}}return guards;}catch{foreach(var guard in guards)guard.Dispose();throw;}
    }
    static Snapshot Read(SafeFileHandle handle,string full) {
        var info=ReadInfo(handle);if((info.Attributes&ReparseAttribute)==0)throw new InvalidOperationException("Ordinary files/directories are not link objects");
        var buffer=new byte[16*1024];uint returned;
        if(!DeviceIoControl(handle,GetReparsePoint,IntPtr.Zero,0,buffer,(uint)buffer.Length,out returned,IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error(),"Opaque reparse data read failed");
        if(returned<8||returned>buffer.Length)throw new InvalidOperationException("Invalid opaque reparse length");
        var raw=new byte[returned];Array.Copy(buffer,raw,returned);
        if(BitConverter.ToUInt16(raw,4)+8!=raw.Length)throw new InvalidOperationException("Opaque reparse size differs");
        return new Snapshot{path=full,dev=info.VolumeSerial.ToString(),ino=(((ulong)info.IndexHigh<<32)|info.IndexLow).ToString(),attributes=info.Attributes,tag=BitConverter.ToUInt32(raw,0),directory=(info.Attributes&DirectoryAttribute)!=0,rawBase64=Convert.ToBase64String(raw),rawSha256=Sha(raw),rawBytes=raw.Length,lastWriteFileTime=(((ulong)info.WriteHigh<<32)|info.WriteLow).ToString()};
    }
    static bool Same(Snapshot a,Snapshot b) { return a.dev==b.dev&&a.ino==b.ino&&a.attributes==b.attributes&&a.tag==b.tag&&a.rawSha256==b.rawSha256&&a.rawBytes==b.rawBytes&&a.lastWriteFileTime==b.lastWriteFileTime; }
    public static Snapshot Capture(string workspace,string name) {
        string full=Admitted(workspace,name);var parents=Parents(workspace,full);
        try{using(var handle=Open(full,Attributes,ShareRead|ShareWrite|ShareDelete)){var before=Read(handle,full);var after=Read(handle,full);if(!Same(before,after))throw new InvalidOperationException("Link object changed during capture");return before;}}finally{foreach(var guard in parents)guard.Dispose();}
    }
    public static Snapshot Retire(string workspace,string name,string dev,string ino,string rawSha256,string writeTime,uint attributes,uint tag) {
        string full=Admitted(workspace,name);var parents=Parents(workspace,full);
        try{using(var handle=Open(full,Attributes|DeleteAccess,0)){
            var found=Read(handle,full);
            if(found.dev!=dev||found.ino!=ino||found.rawSha256!=rawSha256||found.lastWriteFileTime!=writeTime||found.attributes!=attributes||found.tag!=tag)throw new InvalidOperationException("Reparse object was replaced or changed; retain it");
            var disposition=new Disposition{Delete=true};if(!SetFileInformationByHandle(handle,4,ref disposition,(uint)Marshal.SizeOf(typeof(Disposition))))throw new Win32Exception(Marshal.GetLastWin32Error(),"Same-handle link-object deletion refused");return found;
        }}finally{foreach(var guard in parents)guard.Dispose();}
    }
    public static bool IsMissing(string workspace,string name) {
        string full=Admitted(workspace,name);var parents=Parents(workspace,full);
        try{using(var handle=CreateFileW(Native(full),Attributes,ShareRead|ShareWrite|ShareDelete,IntPtr.Zero,OpenExisting,BackupSemantics|OpenReparsePoint,IntPtr.Zero)){
            if(!handle.IsInvalid)return false;int error=Marshal.GetLastWin32Error();if(error==2||error==3)return true;throw new Win32Exception(error,"No-follow missing-object probe refused");
        }}finally{foreach(var guard in parents)guard.Dispose();}
    }
    public static Inventory ListLinks(string workspace) {
        var result=new Inventory();string root=Full(workspace),local=Path.Combine(root,".local");
        using(var rootGuard=Open(root,GenericRead,ShareRead|ShareWrite)){
            var info=ReadInfo(rootGuard);if((info.Attributes&ReparseAttribute)!=0||(info.Attributes&DirectoryAttribute)==0)throw new InvalidOperationException("Workspace root is not an ordinary directory");result.workspaceIdentity=DirectoryIdentity(root,info);
            Walk(root,local,result,0);
        }return result;
    }
    static void Walk(string root,string dir,Inventory result,int depth) {
        if(depth>100||++result.directories>250000)throw new InvalidOperationException("Link inventory directory bound exceeded");
        using(var guard=Open(dir,GenericRead,ShareRead|ShareWrite)){
            var info=ReadInfo(guard);if((info.Attributes&ReparseAttribute)!=0||(info.Attributes&DirectoryAttribute)==0)throw new InvalidOperationException("Inventory directory changed or linked");result.directoryEntries.Add(DirectoryIdentity(dir,info));
            FindData data;IntPtr search=FindFirstFileW(Native(Path.Combine(dir,"*")),out data);
            if(search==new IntPtr(-1)){int error=Marshal.GetLastWin32Error();if(error==2)return;throw new Win32Exception(error,"No-follow directory enumeration failed");}
            try{do{
                if(data.Name=="."||data.Name=="..")continue;
                string full=Path.Combine(dir,data.Name);
                if((data.Attributes&ReparseAttribute)!=0){result.links.Add(full.Substring(root.Length+1).Replace('\\','/'));if(result.links.Count>2048)throw new InvalidOperationException("Link inventory count bound exceeded");}
                else if((data.Attributes&DirectoryAttribute)!=0)Walk(root,full,result,depth+1);
                else if(++result.regularFiles>200000)throw new InvalidOperationException("Remaining regular-file inventory exceeds bound");
            }while(FindNextFileW(search,out data));int error=Marshal.GetLastWin32Error();if(error!=18)throw new Win32Exception(error,"No-follow enumeration interrupted");}finally{FindClose(search);}
        }
    }
    public static void SetDirectoryClaims(DirectorySnapshot[] entries) {
        if(entries.Length==0||entries.Length>250001)throw new InvalidOperationException("Directory claim count invalid");
        var claims=new Dictionary<string,DirectorySnapshot>(StringComparer.OrdinalIgnoreCase);
        foreach(var entry in entries){string full=Full(entry.path);if(claims.ContainsKey(full)||(entry.attributes&ReparseAttribute)!=0||(entry.attributes&DirectoryAttribute)==0)throw new InvalidOperationException("Duplicate, linked or ordinary-file directory claim");claims.Add(full,entry);}directoryClaims=claims;
    }
    static string AdmittedDirectory(string workspace,string name) {
        string full=Full(name),local=Path.Combine(Full(workspace),".local");if(full==local)return full;return Admitted(workspace,name);
    }
    public static DirectorySnapshot RetireEmptyDirectory(string workspace,string name) {
        string full=AdmittedDirectory(workspace,name);DirectorySnapshot expected;
        if(directoryClaims==null||!directoryClaims.TryGetValue(full,out expected))throw new InvalidOperationException("Directory was not explicitly planned");
        var parents=Parents(workspace,full);
        try{using(var handle=Open(full,GenericRead|DeleteAccess,0)){
            var info=ReadInfo(handle);var actual=DirectoryIdentity(full,info);
            if((info.Attributes&ReparseAttribute)!=0||(info.Attributes&DirectoryAttribute)==0||!SameDirectory(actual,expected))throw new InvalidOperationException("Directory changed, replaced, or became linked");
            // Windows atomically refuses FileDispositionInfo for a nonempty
            // directory. No recursion and no deletion of child files occurs.
            var disposition=new Disposition{Delete=true};if(!SetFileInformationByHandle(handle,4,ref disposition,(uint)Marshal.SizeOf(typeof(Disposition))))throw new Win32Exception(Marshal.GetLastWin32Error(),"Empty-only same-handle directory retirement refused");return actual;
        }}finally{foreach(var guard in parents)guard.Dispose();}
    }
    public static bool IsDirectoryMissing(string workspace,string name) {
        string full=AdmittedDirectory(workspace,name),root=Full(workspace),current=full;var names=new List<string>();var guards=new List<SafeFileHandle>();
        while(current!=null&&current.Length>=root.Length){names.Add(current);if(String.Equals(current,root,StringComparison.OrdinalIgnoreCase))break;current=Path.GetDirectoryName(current);}names.Reverse();
        try{foreach(string item in names){
            var handle=CreateFileW(Native(item),GenericRead,ShareRead|ShareWrite,IntPtr.Zero,OpenExisting,BackupSemantics|OpenReparsePoint,IntPtr.Zero);
            if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();if(error==2||error==3)return true;throw new Win32Exception(error,"No-follow directory probe refused");}
            guards.Add(handle);var info=ReadInfo(handle);DirectorySnapshot expected;
            if((info.Attributes&ReparseAttribute)!=0||(info.Attributes&DirectoryAttribute)==0||directoryClaims==null||!directoryClaims.TryGetValue(item,out expected)||!SameDirectory(expected,DirectoryIdentity(item,info)))throw new InvalidOperationException("Directory probe found a linked or replaced object");
        }return false;}finally{foreach(var guard in guards)guard.Dispose();}
    }
}
