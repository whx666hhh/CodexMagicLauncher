using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Accessibility;
using System.Windows.Automation;

static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct P {public int X,Y; public P(int x,int y){X=x;Y=y;}}
  [StructLayout(LayoutKind.Sequential)] public struct R {
    public int L,T,Rt,B;
    public int Width {get{return Rt-L;}} public int Height {get{return B-T;}}
    public Rectangle Rect {get{return Rectangle.FromLTRB(L,T,Rt,B);}}
    public R(int x,int y,int r,int b){L=x;T=y;Rt=r;B=b;}
  }
  [StructLayout(LayoutKind.Sequential)] public struct Placement {
    public int Length,Flags,Show; public P Min,Max; public R Normal;
  }
  public delegate bool EnumProc(IntPtr h,IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out R r);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr h,ref Placement p);
  [DllImport("user32.dll")] public static extern bool SetWindowPlacement(IntPtr h,ref Placement p);
  [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h,IntPtr r);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h,IntPtr r,bool redraw);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int how);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int hgt,uint flags);
  [DllImport("user32.dll")] public static extern bool RedrawWindow(IntPtr h,IntPtr r,IntPtr update,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder name,int max);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int index,int value);
  [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h,out uint color,out byte alpha,out uint flags);
  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h,uint color,byte alpha,uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l,int t,int r,int b);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
  [DllImport("gdi32.dll")] public static extern uint GetRegionData(IntPtr r,uint size,byte[] data);
  [DllImport("gdi32.dll")] public static extern IntPtr ExtCreateRegion(IntPtr transform,uint size,byte[] data);
  [DllImport("gdi32.dll")] public static extern int CombineRgn(IntPtr dest,IntPtr a,IntPtr b,int mode);
  [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr region,out R rect);
  [DllImport("dwmapi.dll")] public static extern int DwmFlush();
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint id);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p,int flags,StringBuilder path,ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr h,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint milliseconds);
  [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h,uint id,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out IAccessible accessible);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr CreateWindowEx(int ex,string cls,string title,int style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
  [DllImport("user32.dll")] public static extern bool DestroyWindow(IntPtr h);
  public static string Class(IntPtr h){var b=new StringBuilder(128);GetClassName(h,b,b.Capacity);return b.ToString();}
  public static uint Pid(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);return pid;}
  public static string ProcessPath(uint pid){IntPtr p=OpenProcess(0x1000,false,pid);if(p==IntPtr.Zero)return "";try{var s=new StringBuilder(2048);int n=s.Capacity;return QueryFullProcessImageName(p,0,s,ref n)?s.ToString():"";}finally{CloseHandle(p);}}
  public static bool Official(string path){return Regex.IsMatch(path??"",@"(?i)\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(?:ChatGPT|Codex)\.exe$");}
  public struct WindowCandidate {public IntPtr Handle;public uint Pid;public int Width,Height;}
  public static IntPtr SelectCodexWindow(List<WindowCandidate> candidates,HashSet<uint> owned=null,int width=0,int height=0){
    var found=new List<IntPtr>();
    foreach(var c in candidates){
      if(owned!=null&&(!owned.Contains(c.Pid)||Math.Abs(c.Width-width)>4||Math.Abs(c.Height-height)>4))continue;
      found.Add(c.Handle);
    }
    if(found.Count==0)throw new Exception("没有找到与已验证界面匹配的 Codex 主窗口。");
    if(found.Count>1)throw new Exception("检测到多个匹配的 Codex 窗口，无法唯一确定目标。请保留一个 Codex 主窗口后重试。");
    return found[0];
  }
  public static IntPtr CodexWindow(bool includeHidden=false,HashSet<uint> owned=null,int clientWidth=0,int clientHeight=0){
    var found=new List<WindowCandidate>();var paths=new Dictionary<uint,bool>();
    EnumWindows(delegate(IntPtr h,IntPtr unused){
      if((!includeHidden&&!IsWindowVisible(h))||(GetWindowLong(h,-20)&0x80)!=0)return true;
      uint pid=Pid(h);bool trusted;if(!paths.TryGetValue(pid,out trusted)){trusted=Official(ProcessPath(pid));paths[pid]=trusted;}
      if(!trusted)return true;
      R r;if(IsIconic(h)){Placement p=new Placement{Length=Marshal.SizeOf(typeof(Placement))};if(!GetWindowPlacement(h,ref p))return true;r=p.Normal;}else if(!GetWindowRect(h,out r))return true;
      if(r.Width<600||r.Height<350)return true;
      R c;if(!GetClientRect(h,out c))return true;
      found.Add(new WindowCandidate{Handle=h,Pid=pid,Width=c.Width,Height=c.Height});return true;
    },IntPtr.Zero);
    return SelectCodexWindow(found,owned,clientWidth,clientHeight);
  }
  public static IntPtr DesktopIcons(){
    IntPtr result=IntPtr.Zero;var choices=new List<IntPtr>();
    EnumWindows(delegate(IntPtr top,IntPtr unused){EnumChildWindows(top,delegate(IntPtr child,IntPtr p){if(Class(child)=="SysListView32"&&Class(GetParent(child))=="SHELLDLL_DefView")choices.Add(child);return true;},IntPtr.Zero);return true;},IntPtr.Zero);
    foreach(var h in choices)if(IsWindowVisible(h)){result=h;break;}
    if(result==IntPtr.Zero||!IsWindowVisible(result))throw new Exception("当前桌面图标不可见；本示例会保留原来的隐藏状态，请显示桌面图标后再试。");return result;
  }
  public static object DesktopStructure(){
    var nodes=new List<object>();
    EnumWindows(delegate(IntPtr top,IntPtr unused){string cls=Class(top);if(cls=="WorkerW"||cls=="Progman"){
      nodes.Add(new{kind=cls,visible=IsWindowVisible(top),parentKind="top"});
      EnumChildWindows(top,delegate(IntPtr child,IntPtr p){string c=Class(child);if(c=="SHELLDLL_DefView"||c=="SysListView32")nodes.Add(new{kind=c,visible=IsWindowVisible(child),parentKind=Class(GetParent(child))});return true;},IntPtr.Zero);
    }return true;},IntPtr.Zero);return nodes;
  }
  public static List<Rectangle> IconBounds(IntPtr view,Rectangle screen){
    // Windows 11's shell exposes virtual item objects, not necessarily child IDs
    // 1..accChildCount. Prefer UIA geometry; never read names or file contents.
    AutomationElementCollection items;var cache=new CacheRequest{TreeScope=TreeScope.Element};cache.Add(AutomationElement.BoundingRectangleProperty);
    using(cache.Activate())items=AutomationElement.FromHandle(view).FindAll(TreeScope.Children,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ListItem));
    var geometry=new List<Rectangle>();
    foreach(AutomationElement item in items){var r=item.Cached.BoundingRectangle;if(r.IsEmpty||r.Width<4||r.Height<4||r.Width>600||r.Height>400)continue;
      Rectangle clipped=Rectangle.Intersect(Rectangle.FromLTRB((int)Math.Floor(r.Left)-2,(int)Math.Floor(r.Top)-2,(int)Math.Ceiling(r.Right)+2,(int)Math.Ceiling(r.Bottom)+2),screen);
      if(clipped.Width>3&&clipped.Height>3)geometry.Add(clipped);
    }
    if(geometry.Count>0)return geometry;
    Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");IAccessible acc;
    if(AccessibleObjectFromWindow(view,unchecked((uint)-4),ref iid,out acc)!=0||acc==null)throw new Exception("无法读取当前桌面图标的位置。");
    var result=new List<Rectangle>();
    try{int count=acc.accChildCount;if(count>2000)throw new Exception("桌面图标数量超出本示例范围。");
      for(int i=1;i<=count;i++)try{
        int x,y,w,h;acc.accLocation(out x,out y,out w,out h,i);
        if(w<4||h<4||w>600||h>400)continue;
        var r=Rectangle.Intersect(new Rectangle(x-2,y-2,w+4,h+4),screen);
        if(r.Width<4||r.Height<4)continue;
        bool duplicate=false;foreach(var existing in result)if(existing==r)duplicate=true;
        if(!duplicate)result.Add(r);
      }catch(COMException){}
    }finally{Marshal.ReleaseComObject(acc);}
    if(result.Count==0)throw new Exception("当前显示器上没有可用于消散的桌面图标。");return result;
  }
  public static byte[] RegionData(IntPtr h){
    IntPtr r=CreateRectRgn(0,0,0,0);try{int type=GetWindowRgn(h,r);if(type==0)return null;uint size=GetRegionData(r,0,null);if(size<32||size>4*1024*1024)throw new Exception("原窗口裁剪区域无法可靠保存。");byte[] data=new byte[size];if(GetRegionData(r,size,data)!=size)throw new Exception("窗口裁剪区域读取失败。");return data;}finally{DeleteObject(r);}
  }
  public static void Region(IntPtr hwnd,IntPtr region){
    if(SetWindowRgn(hwnd,region,true)==0){if(region!=IntPtr.Zero)DeleteObject(region);throw new Exception("无法设置窗口显示区域，示例已停止。");}
    // SetWindowRgn transfers ownership to the OS; never delete on success.
  }
  public static void RestoreRegion(IntPtr h,byte[] original){IntPtr r=original==null?IntPtr.Zero:ExtCreateRegion(IntPtr.Zero,(uint)original.Length,original);if(original!=null&&r==IntPtr.Zero)throw new Exception("恢复原窗口区域失败。");Region(h,r);}
  public static bool SameWindow(long hwnd,uint pid,long ticks){
    IntPtr h=new IntPtr(hwnd);if(!IsWindow(h)||Pid(h)!=pid)return false;
    try{return Started(pid)==ticks;}catch{return false;}
  }
  public static long Started(uint pid){
    IntPtr p=OpenProcess(0x1000,false,pid);if(p==IntPtr.Zero)throw new Exception("无法核验进程启动时间。");
    try{long created,exited,kernel,user;if(!GetProcessTimes(p,out created,out exited,out kernel,out user))throw new Exception("无法核验进程启动时间。");return DateTime.FromFileTimeUtc(created).Ticks;}finally{CloseHandle(p);}
  }
  public static bool AliveSince(uint pid,long ticks){
    IntPtr p=OpenProcess(0x101000,false,pid);if(p==IntPtr.Zero)return false;
    try{long created,exited,kernel,user;return WaitForSingleObject(p,0)==258&&GetProcessTimes(p,out created,out exited,out kernel,out user)&&DateTime.FromFileTimeUtc(created).Ticks==ticks;}finally{CloseHandle(p);}
  }
}

// The record contains native shapes/handles, never pixels or application text.
class Recovery {
  public int Parent;public long ParentStarted,Target,Icons,TargetStarted,IconsStarted;
  public uint TargetPid,IconsPid;public byte[] OriginalRegion;public Win.Placement Placement;
  public byte[] OriginalIconsRegion;public bool IconsRegionCaptured;
  public bool OriginalIconsVisible;
  public bool AlphaCaptured;public int OriginalExStyle;public uint OriginalColor,OriginalAlphaFlags;public byte OriginalAlpha;
  public bool TargetVisibilityCaptured,OriginalTargetVisible;
  public static Recovery Capture(IntPtr target,IntPtr icons){
    var r=new Recovery{Parent=Process.GetCurrentProcess().Id,ParentStarted=Win.Started((uint)Process.GetCurrentProcess().Id),Target=target.ToInt64(),Icons=icons.ToInt64(),TargetPid=Win.Pid(target),IconsPid=Win.Pid(icons),OriginalRegion=Win.RegionData(target),OriginalIconsVisible=Win.IsWindowVisible(icons)};
    r.OriginalIconsRegion=Win.RegionData(icons);r.IconsRegionCaptured=true;
    r.TargetStarted=Win.Started(r.TargetPid);r.IconsStarted=Win.Started(r.IconsPid);r.Placement=new Win.Placement{Length=Marshal.SizeOf(typeof(Win.Placement))};
    if(!Win.GetWindowPlacement(target,ref r.Placement))throw new Exception("无法保存 Codex 窗口状态。");return r;
  }
  public bool Restore(bool cancelled){
    bool ok=true;
    if(Win.SameWindow(Target,TargetPid,TargetStarted))try{
      var h=new IntPtr(Target);Win.RestoreRegion(h,OriginalRegion);
      if(AlphaCaptured){
        if((OriginalExStyle&0x80000)!=0){if(!Win.SetLayeredWindowAttributes(h,OriginalColor,OriginalAlpha,OriginalAlphaFlags))ok=false;}
        Win.SetWindowLong(h,-20,OriginalExStyle);Win.RedrawWindow(h,IntPtr.Zero,IntPtr.Zero,0x185);
        if(Win.GetWindowLong(h,-20)!=OriginalExStyle)ok=false;
      }
      if(cancelled){var p=Placement;Win.SetWindowPlacement(h,ref p);}
      if(TargetVisibilityCaptured){Win.ShowWindow(h,OriginalTargetVisible?8:0);if(Win.IsWindowVisible(h)!=OriginalTargetVisible)ok=false;}
    }catch{ok=false;}
    if(Win.SameWindow(Icons,IconsPid,IconsStarted)){
      try{if(IconsRegionCaptured)Win.RestoreRegion(new IntPtr(Icons),OriginalIconsRegion);}catch{ok=false;}
      Win.ShowWindow(new IntPtr(Icons),OriginalIconsVisible?8:0);Win.RedrawWindow(new IntPtr(Icons),IntPtr.Zero,IntPtr.Zero,0x185);if(Win.IsWindowVisible(new IntPtr(Icons))!=OriginalIconsVisible)ok=false;
    }
    return ok;
  }
  public bool ParentAlive(){return Win.AliveSince((uint)Parent,ParentStarted);}
}
