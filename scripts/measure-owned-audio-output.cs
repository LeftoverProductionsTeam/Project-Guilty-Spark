using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace SparkAudioEvidence {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
  [PreserveSig]int EnumAudioEndpoints(int flow,uint states,out IntPtr devices);
  [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  [PreserveSig]int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object value);
 }
 [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
  [PreserveSig]int GetAudioSessionControl(IntPtr guid,uint flags,out IntPtr control);
  [PreserveSig]int GetSimpleAudioVolume(IntPtr guid,uint flags,out IntPtr volume);
  [PreserveSig]int GetSessionEnumerator(out ISessionList sessions);
 }
 [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionList {
  [PreserveSig]int GetCount(out int count);
  [PreserveSig]int GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)]out object session);
 }
 [ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISession {
  [PreserveSig]int GetState(out int state);
  [PreserveSig]int GetDisplayName(out IntPtr name);
  [PreserveSig]int SetDisplayName(IntPtr name,IntPtr context);
  [PreserveSig]int GetIconPath(out IntPtr name);
  [PreserveSig]int SetIconPath(IntPtr name,IntPtr context);
  [PreserveSig]int GetGroupingParam(out Guid guid);
  [PreserveSig]int SetGroupingParam(ref Guid guid,IntPtr context);
  [PreserveSig]int RegisterAudioSessionNotification(IntPtr client);
  [PreserveSig]int UnregisterAudioSessionNotification(IntPtr client);
  [PreserveSig]int GetSessionIdentifier(out IntPtr name);
  [PreserveSig]int GetSessionInstanceIdentifier(out IntPtr name);
  [PreserveSig]int GetProcessId(out uint pid);
 }
 [ComImport,Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMeter {
  [PreserveSig]int GetPeakValue(out float peak);
 }
 public class Reading { public uint ProcessId; public int State; public float Peak; }
 public static class Probe {
  public static Reading[] Read(int[] owned) {
   var found=new List<Reading>();object enumerator=null,manager=null;IDevice device=null;ISessionList sessions=null;
   try {
    enumerator=new DeviceEnumerator();Marshal.ThrowExceptionForHR(((IDevices)enumerator).GetDefaultAudioEndpoint(0,1,out device));
    var iid=typeof(ISessions).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out manager));
    Marshal.ThrowExceptionForHR(((ISessions)manager).GetSessionEnumerator(out sessions));int count;Marshal.ThrowExceptionForHR(sessions.GetCount(out count));
    for(int i=0;i<count;i++){object raw=null;try{
     if(sessions.GetSession(i,out raw)<0)continue;var session=(ISession)raw;uint pid;if(session.GetProcessId(out pid)<0||Array.IndexOf(owned,(int)pid)<0)continue;
     int state;float peak;Marshal.ThrowExceptionForHR(session.GetState(out state));Marshal.ThrowExceptionForHR(((IMeter)session).GetPeakValue(out peak));
     found.Add(new Reading{ProcessId=pid,State=state,Peak=peak});
    }finally{if(raw!=null)Marshal.ReleaseComObject(raw);}}
   }finally{if(sessions!=null)Marshal.ReleaseComObject(sessions);if(manager!=null)Marshal.ReleaseComObject(manager);if(device!=null)Marshal.ReleaseComObject(device);if(enumerator!=null)Marshal.ReleaseComObject(enumerator);}
   return found.ToArray();
  }
 }
}

namespace SparkAudioEvidence {
 public static class Program {
  public static int Main(string[] args) {
   try {
    if(args.Length!=3)throw new Exception("Expected own Spark process ID, fresh output and capture seconds");
    int root=int.Parse(args[0]),seconds=int.Parse(args[2]);
    if(seconds<1||seconds>30||System.IO.File.Exists(args[1]))throw new Exception("Capture must be 1-30 seconds with a fresh output file");
    var process=System.Diagnostics.Process.GetProcessById(root);
    if(!process.ProcessName.StartsWith("GuiltySpark",StringComparison.OrdinalIgnoreCase))throw new Exception("Select an owned Spark test process");
    var ids=new System.Collections.Generic.HashSet<int>();ids.Add(root);
    var parents=new System.Collections.Generic.List<System.Tuple<int,int>>();
    using(var query=new System.Management.ManagementObjectSearcher("SELECT ProcessId, ParentProcessId FROM Win32_Process"))
     using(var found=query.Get())foreach(System.Management.ManagementObject item in found)using(item)parents.Add(System.Tuple.Create(Convert.ToInt32(item["ProcessId"]),Convert.ToInt32(item["ParentProcessId"])));
    bool changed=true;while(changed&&ids.Count<128){changed=false;foreach(var pair in parents)if(ids.Contains(pair.Item2)&&ids.Add(pair.Item1))changed=true;}
    var owned=new int[ids.Count];ids.CopyTo(owned);var rows=new System.Collections.Generic.List<object>();var clock=System.Diagnostics.Stopwatch.StartNew();
    while(clock.Elapsed.TotalSeconds<seconds){rows.Add(new {elapsedMs=clock.ElapsedMilliseconds,utc=DateTime.UtcNow.ToString("O"),sessions=Probe.Read(owned)});System.Threading.Thread.Sleep(80);}
    var report=new {schemaVersion=1,rootProcessId=root,ownedProcessIds=owned,kind="Windows render-session peak meter",microphoneOrSampleCapture=false,readings=rows,limitation="Windows session output measurement; not human hearing or Halo gameplay acceptance."};
    var json=new System.Web.Script.Serialization.JavaScriptSerializer();json.MaxJsonLength=4*1024*1024;
    using(var file=new System.IO.FileStream(args[1],System.IO.FileMode.CreateNew,System.IO.FileAccess.Write))using(var writer=new System.IO.StreamWriter(file,new System.Text.UTF8Encoding(false)))writer.Write(json.Serialize(report));
    return 0;
   }catch(Exception error){Console.Error.WriteLine(error.ToString());return 1;}
  }
 }
}
