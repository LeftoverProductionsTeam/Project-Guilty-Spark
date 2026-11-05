// Exact-file Windows retirement primitive shared by Cargo and native-tag tools.
// An exclusive deletion handle seals identity/hash/deletion to one file object.
using System;
using System.IO;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;
public static class SparkSealedFiles {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
    public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Basic { public long Creation,Access,Write,Change; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] public struct Standard { public long Allocation,End; public uint Links; public byte Pending,Directory; }
  [StructLayout(LayoutKind.Sequential)] public struct Disposition { [MarshalAs(UnmanagedType.Bool)] public bool Delete; }
  [StructLayout(LayoutKind.Sequential)] public struct TagInfo { public uint Attributes,Tag; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info value);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int kind,out Standard value,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int kind,out Basic value,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int kind,out TagInfo value,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int kind,ref Disposition value,uint size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetCompressedFileSizeW(string path,out uint high);
  static string NativePath(string p) { if(p.StartsWith(@"\\?\",StringComparison.Ordinal))return p; if(p.StartsWith(@"\\",StringComparison.Ordinal))return @"\\?\UNC\"+p.Substring(2); if(p.Length>=3 && Char.IsLetter(p[0]) && p[1]==':' && (p[2]=='\\' || p[2]=='/'))return @"\\?\"+p.Replace('/','\\'); throw new IOException("Native path must already be fully qualified and validated"); }
  static Exception Error(string p) { return new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),p); }
  public static SafeFileHandle Directory(string path) { var h=CreateFileW(NativePath(path),0x80000000u,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);if(h.IsInvalid)throw Error(path);return h; }
  // A metadata-only access mask does not participate in Windows share-access
  // accounting. Keep READ_DATA access, without allocating a FileStream buffer.
  public static SafeFileHandle ProtectFile(string path) { var h=CreateFileW(NativePath(path),0x80000000u,1,IntPtr.Zero,3,0x00200000,IntPtr.Zero);if(h.IsInvalid)throw Error(path);try{if((Information(h).Attributes&0x410)!=0)throw new IOException("Linked/non-file protection refused");return h;}catch{h.Dispose();throw;} }
  public static Info Information(SafeFileHandle h) { Info i;if(!GetFileInformationByHandle(h,out i))throw Error("Read file identity");return i; }
  public static Basic BasicInformation(SafeFileHandle h) { Basic i;if(!GetFileInformationByHandleEx(h,0,out i,(uint)Marshal.SizeOf(typeof(Basic))))throw Error("Read change identity");return i; }
  public static string Id(Info i) { return (((ulong)i.IndexHigh<<32)|i.IndexLow).ToString(CultureInfo.InvariantCulture); }
  public static string VolumeId(Info i) { return i.Volume.ToString(CultureInfo.InvariantCulture); }
  public static long Length(Info i) { return (long)(((ulong)i.SizeHigh<<32)|i.SizeLow); }
  public static string UnixNs(long value) {return (((decimal)value-116444736000000000m)*100m).ToString("0",CultureInfo.InvariantCulture);}
  public static string ModifiedNs(Info i) {var t=((ulong)(uint)i.Write.dwHighDateTime<<32)|(uint)i.Write.dwLowDateTime;return UnixNs((long)t);}
  public static bool IsCloudPlaceholder(string path) {using(var h=Directory(path)){TagInfo i;if(!GetFileInformationByHandleEx(h,9,out i,(uint)Marshal.SizeOf(typeof(TagInfo))))throw Error("Read journal reparse tag");return (i.Tag&0xFFFF0FFFu)==0x9000001Au;}}
  public sealed class File : IDisposable {
    public FileStream Stream; public SafeFileHandle Handle; public Info Identity; public Basic BasicIdentity; string Path;
    public File(string path,bool deletion) {
      Path=path;Handle=CreateFileW(NativePath(path),deletion?0x80010000u:0x80000000u,deletion?0u:1u,IntPtr.Zero,3,0x08200000,IntPtr.Zero);if(Handle.IsInvalid)throw Error(path);
      try{Identity=Information(Handle);BasicIdentity=BasicInformation(Handle);if((Identity.Attributes&0x410)!=0)throw new IOException("Directory/reparse file refused: "+path);Stream=new FileStream(Handle,FileAccess.Read,65536,false);}catch{Handle.Dispose();throw;}
    }
    public string Hash(){Stream.Position=0;using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Stream)).Replace("-","").ToLowerInvariant();}
    public long Allocation(){Standard s;if(!GetFileInformationByHandleEx(Handle,1,out s,(uint)Marshal.SizeOf(typeof(Standard))))throw Error("Read allocation");if(s.Links!=1)return 0;uint high;uint low=GetCompressedFileSizeW(NativePath(Path),out high);if(low==0xFFFFFFFFu)throw Error("Read physical file allocation");return (long)(((ulong)high<<32)|low);}
    public void DeleteVerified(){var d=new Disposition{Delete=true};if(!SetFileInformationByHandle(Handle,4,ref d,(uint)Marshal.SizeOf(typeof(Disposition))))throw Error("Delete verified file");}
    public void Dispose(){if(Stream!=null)Stream.Dispose();if(Handle!=null)Handle.Dispose();}
  }
}
