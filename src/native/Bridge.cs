using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Forms=System.Windows.Forms;
[assembly:System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly:System.Reflection.AssemblyFileVersion("1.0.0.0")]

static class Bridge {
  static JavaScriptSerializer json=new JavaScriptSerializer();
  static string stateRoot;static Recovery recovery;static string journal;static IntPtr target,icons;
  static Rectangle original,client,screen;static bool armed;static int iconPhase=-1;
  static List<Rectangle> iconRects=new List<Rectangle>();static int iconStep=-1;
  static bool desktopFirst,attachRequested;static IntPtr syntheticCandidate;static double latestTime;static double[] latestIconVisibility;
  static HashSet<uint> verifiedPids;static int verifiedWidth,verifiedHeight;
  static int appliedAlpha=-1;static double appliedFill=-1;static double[] appliedIcons;
  static double Hash(double n){double q=Math.Sin(n*127.1+311.7)*43758.5453123;return q-Math.Floor(q);}
  [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out Win.R r);
  [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr h,ref Win.P p);
  static void Emit(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static string Arg(string[] args,string key,string fallback){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:fallback;}
  static Rectangle Bounds(IntPtr h){Win.R r;if(!Win.GetWindowRect(h,out r))throw new Exception("窗口边界不可用。");return r.Rect;}
  static Rectangle Client(IntPtr h){Win.R r;Win.P p=new Win.P();if(!GetClientRect(h,out r)||!ClientToScreen(h,ref p))throw new Exception("窗口内容区域不可用。");return new Rectangle(p.X,p.Y,r.Width,r.Height);}
  static object Rect(Rectangle r){return new{x=r.X,y=r.Y,width=r.Width,height=r.Height};}
  static string RegionHash(IntPtr h){if(h==IntPtr.Zero)return "absent";var data=Win.RegionData(h);if(data==null)return "default";using(var hash=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(hash.ComputeHash(data)).Replace("-","");}
  static bool SameOwner(){return recovery!=null&&Win.SameWindow(recovery.Target,recovery.TargetPid,recovery.TargetStarted);}
  static void Restore(bool showTarget=false){if(!armed)return;if(recovery.Restore(false)){if(showTarget&&SameOwner())Win.ShowWindow(target,8);if(File.Exists(journal))File.Delete(journal);armed=false;}else throw new Exception("自动恢复尚未完成，恢复守护会继续重试。");}
  static void Arm(bool announce){
    if(armed&&recovery.Target==target.ToInt64()){if(announce)Emit(new{stage="armed"});return;}
    var next=new Recovery{Parent=Process.GetCurrentProcess().Id,ParentStarted=Win.Started((uint)Process.GetCurrentProcess().Id)};
    if(target!=IntPtr.Zero){
      next.Target=target.ToInt64();next.TargetPid=Win.Pid(target);next.TargetStarted=Win.Started(next.TargetPid);next.OriginalRegion=Win.RegionData(target);next.Placement=new Win.Placement{Length=Marshal.SizeOf(typeof(Win.Placement))};
      if(!Win.GetWindowPlacement(target,ref next.Placement))throw new Exception("无法保存窗口状态。");
      next.OriginalExStyle=Win.GetWindowLong(target,-20);next.OriginalAlpha=255;next.OriginalAlphaFlags=2;
      if((next.OriginalExStyle&0x80000)!=0&&!Win.GetLayeredWindowAttributes(target,out next.OriginalColor,out next.OriginalAlpha,out next.OriginalAlphaFlags))throw new Exception("当前窗口透明状态无法可靠保存。");
      if((next.OriginalAlphaFlags&2)==0)next.OriginalAlpha=255;
      next.AlphaCaptured=true;next.TargetVisibilityCaptured=true;next.OriginalTargetVisible=Win.IsWindowVisible(target);
    }
    if(armed){
      // The second journal keeps the ORIGINAL icon snapshot, never the already eroded region.
      next.Icons=recovery.Icons;next.IconsPid=recovery.IconsPid;next.IconsStarted=recovery.IconsStarted;next.OriginalIconsVisible=recovery.OriginalIconsVisible;next.OriginalIconsRegion=recovery.OriginalIconsRegion;next.IconsRegionCaptured=recovery.IconsRegionCaptured;
    }else if(icons!=IntPtr.Zero){next.Icons=icons.ToInt64();next.IconsPid=Win.Pid(icons);next.IconsStarted=Win.Started(Win.Pid(icons));next.OriginalIconsVisible=Win.IsWindowVisible(icons);next.OriginalIconsRegion=Win.RegionData(icons);next.IconsRegionCaptured=true;}
    Directory.CreateDirectory(stateRoot);string token=Guid.NewGuid().ToString("N"),nextJournal=Path.Combine(stateRoot,"recovery-"+token+".json");File.WriteAllText(nextJournal,json.Serialize(next),new UTF8Encoding(false));
    using(var ready=new EventWaitHandle(false,EventResetMode.ManualReset,"Local.CodexMagic.Guard."+token)){
      var start=new ProcessStartInfo{FileName=Process.GetCurrentProcess().MainModule.FileName,Arguments="--guard "+token+" --state-dir \""+stateRoot+"\"",UseShellExecute=false,CreateNoWindow=true};
      using(var child=Process.Start(start)){if(!ready.WaitOne(5000)){File.Delete(nextJournal);throw new Exception("恢复守护没有就绪，本次未修改窗口。");}}
    }
    string previous=journal;recovery=next;journal=nextJournal;armed=true;appliedAlpha=-1;appliedFill=-1;
    if(previous!=null&&File.Exists(previous))File.Delete(previous);
    if(target!=IntPtr.Zero)Win.SetWindowLong(target,-20,recovery.OriginalExStyle|0x80000);
    Apply(0,latestTime,0,latestIconVisibility);if(announce)Emit(new{stage="armed"});
  }
  static void KeepOriginal(IntPtr h,IntPtr region,byte[] originalRegion){
    if(originalRegion!=null){IntPtr saved=Win.ExtCreateRegion(IntPtr.Zero,(uint)originalRegion.Length,originalRegion);if(saved==IntPtr.Zero){Win.DeleteObject(region);throw new Exception("原窗口区域不可用。");}Win.CombineRgn(region,region,saved,1);Win.DeleteObject(saved);}Win.Region(h,region);
  }
  static void Apply(double fill,double time,double opacity,double[] iconVisibility=null){
    latestTime=time;latestIconVisibility=iconVisibility;
    if(target==IntPtr.Zero){if(fill>0||opacity>0)throw new Exception("真实窗口尚未附加。");ApplyIcons(time,opacity,iconVisibility);return;}
    if(!SameOwner()||Bounds(target)!=original||Client(target)!=client||Win.IsIconic(target))throw new Exception("窗口已移动或发生变化，动画已交回真实窗口。");
    byte alpha=(byte)Math.Round(opacity*recovery.OriginalAlpha);
    if(appliedAlpha!=alpha){
      if(!Win.SetLayeredWindowAttributes(target,recovery.OriginalColor,alpha,recovery.OriginalAlphaFlags|2))throw new Exception("真实窗口渐显不可用，已停止交接。");
      appliedAlpha=alpha;
    }
    if(appliedFill!=fill){
    if(fill>=1)Win.RestoreRegion(target,recovery.OriginalRegion);
    else {
      IntPtr visible=Win.CreateRectRgn(0,0,fill<=0?0:original.Width,fill<=0?0:original.Height);
      if(fill>0){
        double padding=45*client.Width/1228.8;
        int dx=(int)Math.Round(fill*(client.Width/2.0+padding)),dy=(int)Math.Round(fill*(client.Height/2.0+padding));
        int x=client.Left-original.Left,y=client.Top-original.Top;
        IntPtr hole=Win.CreateRectRgn(x+dx,y+dy,x+Math.Max(dx,client.Width-dx),y+Math.Max(dy,client.Height-dy));
        Win.CombineRgn(visible,visible,hole,4);Win.DeleteObject(hole);
      }
      KeepOriginal(target,visible,recovery.OriginalRegion);
    }
    appliedFill=fill;
    }
    if(opacity<=0){if(Win.IsWindowVisible(target))Win.ShowWindow(target,0);}
    else if(!Win.IsWindowVisible(target))Win.ShowWindow(target,8);
    ApplyIcons(time,opacity,iconVisibility);
  }
  static void Subtract(IntPtr visible,int x,int y,int width,int height){if(width<=0||height<=0)return;IntPtr cut=Win.CreateRectRgn(x,y,x+width,y+height);Win.CombineRgn(visible,visible,cut,4);Win.DeleteObject(cut);}
  static void ApplyIcons(double time,double opacity,double[] amounts=null){
    if(icons==IntPtr.Zero||!recovery.OriginalIconsVisible)return;
    if(amounts!=null){
      if(amounts.Length!=iconRects.Count)throw new Exception("图标恢复状态与几何不一致。");
      bool unchanged=appliedIcons!=null&&appliedIcons.Length==amounts.Length;
      if(unchanged)for(int i=0;i<amounts.Length;i++)if(amounts[i]!=appliedIcons[i]){unchanged=false;break;}
      if(unchanged)return;
      int tick=(int)(time*24);if(tick==iconStep)return;iconStep=tick;
      var bounds=Bounds(icons);IntPtr visible=Win.CreateRectRgn(0,0,bounds.Width,bounds.Height);
      for(int i=0;i<amounts.Length;i++){
        double amount=amounts[i];if(Double.IsNaN(amount)||Double.IsInfinity(amount)||amount<0||amount>1){Win.DeleteObject(visible);throw new Exception("图标状态无效。");}
        var r=iconRects[i];if(amount>=1)continue;if(amount<=0){Subtract(visible,r.X-bounds.X,r.Y-bounds.Y,r.Width,r.Height);continue;}
        for(int row=0;row<r.Height;row+=4){double keep=Math.Max(0,Math.Min(1,amount+(Hash(i*97+row*.4)-.5)*.22*Math.Sin(amount*Math.PI)));int eaten=(int)Math.Round(r.Width*(1-keep));Subtract(visible,r.X-bounds.X+r.Width-eaten,r.Y-bounds.Y+row,eaten,Math.Min(4,r.Height-row));}
      }
      KeepOriginal(icons,visible,recovery.OriginalIconsRegion);appliedIcons=(double[])amounts.Clone();return;
    }
    appliedIcons=null;
    int phase=time<2.2?0:time<12.9?1:opacity<1?2:3,step=(int)(time*12);
    if(phase==iconPhase&&(phase!=1||step==iconStep))return;
    var ib=Bounds(icons);
    if(phase==1){
      IntPtr visible=Win.CreateRectRgn(0,0,ib.Width,ib.Height);
      for(int i=0;i<iconRects.Count;i++){
        var r=iconRects[i];double progress=(time-2.2-.55*Hash(i+7))/1.35;
        if(progress<=0)continue;if(progress>=1){Subtract(visible,r.X-ib.X,r.Y-ib.Y,r.Width,r.Height);continue;}
        bool toRight=r.Left+r.Width/2<client.Left+client.Width/2;
        for(int row=0;row<r.Height;row+=4){
          double p=Math.Max(0,Math.Min(1,progress+(Hash(i*97+row*.4)-.5)*.3));int eaten=(int)Math.Round(r.Width*p);
          Subtract(visible,r.X-ib.X+(toRight?r.Width-eaten:0),r.Y-ib.Y+row,eaten,Math.Min(4,r.Height-row));
        }
      }
      KeepOriginal(icons,visible,recovery.OriginalIconsRegion);Win.ShowWindow(icons,8);
    }else if(phase==2){
      IntPtr visible=Win.CreateRectRgn(0,0,ib.Width,ib.Height);Subtract(visible,original.Left-ib.Left,original.Top-ib.Top,original.Width,original.Height);KeepOriginal(icons,visible,recovery.OriginalIconsRegion);Win.ShowWindow(icons,8);
    }else{Win.RestoreRegion(icons,recovery.OriginalIconsRegion);Win.ShowWindow(icons,8);}
    iconPhase=phase;iconStep=step;
  }
  static void AttachPending(){
    IntPtr found=syntheticCandidate;
    if(found==IntPtr.Zero){try{found=Win.CodexWindow(true,verifiedPids,verifiedWidth,verifiedHeight);}catch(Exception e){if(e.Message.Contains("没有找到"))return;throw;}}
    var nextClient=Client(found);if(!screen.Contains(nextClient))throw new Exception("目标与施法桌面不在同一显示器，已恢复。");
    target=found;original=Bounds(target);client=nextClient;Arm(false);
    if(syntheticCandidate==IntPtr.Zero){
      var work=Forms.Screen.FromHandle(target).WorkingArea;int width=Math.Min(1100,work.Width-64),height=Math.Min(740,work.Height-64);
      Win.ShowWindow(target,9);Win.ShowWindow(target,0);
      if(!Win.SetWindowPos(target,IntPtr.Zero,work.Left+(work.Width-width)/2,work.Top+Math.Max(32,(work.Height-height)/2-120),width,height,0x14))throw new Exception("无法设置小窗尺寸。");
      original=Bounds(target);client=Client(target);Apply(0,latestTime,0,latestIconVisibility);
    }
    Emit(new{stage="target-geometry",pid=Win.Pid(target),screen=Rect(screen),client=Rect(client),outer=Rect(original),provisional=false});
  }
  static int Guard(string token){
    if(!System.Text.RegularExpressions.Regex.IsMatch(token,"^[a-f0-9]{32}$"))return 2;
    string path=Path.Combine(stateRoot,"recovery-"+token+".json");var r=json.Deserialize<Recovery>(File.ReadAllText(path,Encoding.UTF8));
    using(var ready=EventWaitHandle.OpenExisting("Local.CodexMagic.Guard."+token))ready.Set();
    var clock=Stopwatch.StartNew();while(File.Exists(path)&&r.ParentAlive()&&clock.Elapsed.TotalSeconds<270)Thread.Sleep(100);
    if(!File.Exists(path))return 0;for(int i=0;i<10;i++){if(r.Restore(false)){File.Delete(path);return 0;}Thread.Sleep(100);}return 3;
  }
  static int TestTarget(bool maximized){
    using(var form=new Forms.Form{Text="Codex Magic synthetic target",Width=1000,Height=700,StartPosition=Forms.FormStartPosition.CenterScreen,BackColor=Color.FromArgb(24,34,45)}){
      form.Controls.Add(new Forms.Label{Text="Synthetic native target",ForeColor=Color.White,AutoSize=true,Left=60,Top=80});
      if(maximized){form.FormBorderStyle=Forms.FormBorderStyle.None;form.WindowState=Forms.FormWindowState.Maximized;}
      form.Shown+=delegate{Emit(new{stage="test-target",pid=Process.GetCurrentProcess().Id,hwnd=form.Handle.ToInt64()});};Forms.Application.Run(form);
    }return 0;
  }
  [STAThread]static int Main(string[] args){
    Console.OutputEncoding=new UTF8Encoding(false);Win.SetProcessDPIAware();stateRoot=Arg(args,"--state-dir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CodexMagicLauncher"));
    try{
      if(Array.IndexOf(args,"--guard")>=0)return Guard(Arg(args,"--guard",""));
      if(Array.IndexOf(args,"--test-target")>=0)return TestTarget(Array.IndexOf(args,"--maximized")>=0);
      bool inspect=Array.IndexOf(args,"--inspect")>=0;
      desktopFirst=Array.IndexOf(args,"--desktop-first")>=0&&!inspect;
      bool created;using(var mutex=new Mutex(!inspect,"Local.CodexMagic.NativeBridge",out created)){
        if(!created&&!inspect)throw new Exception("已有魔法启动过程正在运行。");
        string synthetic=Arg(args,"--synthetic-pid","");
        if(synthetic!=""){
          int pid=int.Parse(synthetic);target=new IntPtr(long.Parse(Arg(args,"--synthetic-hwnd","0")));
          if(Win.Pid(target)!=(uint)pid||!String.Equals(Win.ProcessPath((uint)pid),Process.GetCurrentProcess().MainModule.FileName,StringComparison.OrdinalIgnoreCase))throw new Exception("合成测试目标身份不符。");
        }else if(!desktopFirst){
          var deadline=Stopwatch.StartNew();while(target==IntPtr.Zero&&deadline.Elapsed.TotalSeconds<240){
            try{target=Win.CodexWindow();}catch(Exception e){if(e.Message.Contains("多个"))throw;}
            if(inspect&&target==IntPtr.Zero){
              if(Directory.Exists(stateRoot))foreach(string path in Directory.GetFiles(stateRoot,"recovery-*.json")){
                var saved=json.Deserialize<Recovery>(File.ReadAllText(path,Encoding.UTF8));
                if(Win.SameWindow(saved.Target,saved.TargetPid,saved.TargetStarted)&&Win.Official(Win.ProcessPath(saved.TargetPid))){target=new IntPtr(saved.Target);break;}
              }
              if(target==IntPtr.Zero)throw new Exception("没有找到可检查的 Codex 窗口。");
            }
            if(target==IntPtr.Zero)Thread.Sleep(150);
          }
          if(target==IntPtr.Zero)throw new Exception("没有找到真实 Codex 窗口。");
          try{icons=Win.DesktopIcons();}catch{icons=IntPtr.Zero;}
        }
        if(desktopFirst){
          syntheticCandidate=target;target=IntPtr.Zero;screen=Forms.Screen.PrimaryScreen.Bounds;var work=Forms.Screen.PrimaryScreen.WorkingArea;
          int width=Math.Min(1100,work.Width-64),height=Math.Min(750,work.Height-64);original=client=new Rectangle(work.Left+(work.Width-width)/2,work.Top+Math.Max(32,(work.Height-height)/2-120),width,height);
          if(syntheticCandidate==IntPtr.Zero)try{icons=Win.DesktopIcons();}catch{icons=IntPtr.Zero;}
        }else{original=Bounds(target);client=Client(target);screen=Forms.Screen.FromHandle(target).Bounds;}
        if(!screen.Contains(client))throw new Exception("窗口跨越显示器边界，请把窗口完整放在一个屏幕内后重试。");
        if(inspect){uint color,flags;byte alpha;bool hasAlpha=Win.GetLayeredWindowAttributes(target,out color,out alpha,out flags);Emit(new{stage="inspected",region=Win.RegionData(target),outer=Rect(original),client=Rect(client),targetVisible=Win.IsWindowVisible(target),exStyle=Win.GetWindowLong(target,-20),alpha=hasAlpha?(int)alpha:-1,iconsVisible=icons!=IntPtr.Zero&&Win.IsWindowVisible(icons),iconsRegion=RegionHash(icons)});return 0;}
        if(!desktopFirst&&Array.IndexOf(args,"--small-window")>=0){
          Arm(false);
          var work=Forms.Screen.FromHandle(target).WorkingArea;int width=Math.Min(1100,work.Width-64),height=Math.Min(740,work.Height-64);
          Win.ShowWindow(target,9);
          Win.ShowWindow(target,0);
          if(!Win.SetWindowPos(target,IntPtr.Zero,work.Left+(work.Width-width)/2,work.Top+Math.Max(32,(work.Height-height)/2-120),width,height,0x14))throw new Exception("无法设置小窗尺寸。");
          original=Bounds(target);client=Client(target);Apply(0,0,0);
        }
        var geometry=new List<object>();if(icons!=IntPtr.Zero){iconRects=Win.IconBounds(icons,screen);foreach(var r in iconRects)geometry.Add(Rect(r));}
        Emit(new{stage="geometry",pid=Win.Pid(target),screen=Rect(screen),client=Rect(client),outer=Rect(original),icons=geometry,synthetic=synthetic!="",provisional=desktopFirst});
        Task<string> line=Task.Run(()=>Console.ReadLine());
        var pointerClock=Stopwatch.StartNew();
        while(true){
          if(Win.GetAsyncKeyState(27)<0){Emit(new{stage="cancelled"});break;}
          if(desktopFirst&&attachRequested&&armed&&target==IntPtr.Zero)AttachPending();
          if(armed&&pointerClock.ElapsedMilliseconds>=50){Win.P point;if(Win.GetCursorPos(out point))Emit(new{stage="pointer",x=point.X,y=point.Y});pointerClock.Restart();}
          if(!line.Wait(25))continue;string text=line.Result;if(text==null)break;if(text.Length>32768)throw new Exception("控制消息无效。");
          var command=json.Deserialize<Dictionary<string,object>>(text);string op=Convert.ToString(command["op"]);
          if(op=="arm")Arm(true);else if(op=="attach"&&desktopFirst&&armed){
            if(syntheticCandidate==IntPtr.Zero){
              var pids=command.ContainsKey("pids")?command["pids"] as System.Collections.IList:null;
              if(pids==null||pids.Count==0||pids.Count>1024||!command.ContainsKey("width")||!command.ContainsKey("height"))throw new Exception("已验证窗口身份不完整。");
              verifiedPids=new HashSet<uint>();foreach(var p in pids){uint pid=Convert.ToUInt32(p);if(pid==0)throw new Exception("已验证进程身份无效。");verifiedPids.Add(pid);}
              verifiedWidth=Convert.ToInt32(command["width"]);verifiedHeight=Convert.ToInt32(command["height"]);
              if(verifiedWidth<100||verifiedHeight<100||verifiedWidth>32768||verifiedHeight>32768)throw new Exception("已验证窗口尺寸无效。");
            }
            attachRequested=true;
          }else if(op=="frame"){
            double fill=Convert.ToDouble(command["fill"]),time=Convert.ToDouble(command["time"]),opacity=command.ContainsKey("opacity")?Convert.ToDouble(command["opacity"]):1;
            double[] amounts=null;if(command.ContainsKey("icons")){var values=command["icons"] as System.Collections.IList;if(values==null||values.Count>2000)throw new Exception("图标状态无效。");amounts=new double[values.Count];for(int i=0;i<values.Count;i++)amounts[i]=Convert.ToDouble(values[i]);}
            if(!armed||Double.IsNaN(fill)||Double.IsInfinity(fill)||Double.IsNaN(time)||Double.IsInfinity(time)||Double.IsNaN(opacity)||Double.IsInfinity(opacity)||opacity<0||opacity>1||fill<0||fill>1||time<0||time>260)throw new Exception("控制状态无效。");Apply(fill,time,opacity,amounts);
            if(command.ContainsKey("serial"))Emit(new{stage="frame-applied",serial=Convert.ToInt64(command["serial"])});
          }else if(op=="restore"){Restore(command.ContainsKey("show")&&Convert.ToBoolean(command["show"]));Emit(new{stage="restored",restored=true});return 0;}else throw new Exception("不支持的控制消息。");
          line=Task.Run(()=>Console.ReadLine());
        }
      }
      return 0;
    }catch(Exception e){Emit(new{stage="failed",message=e.Message});return 1;}
    finally{try{if(armed){Restore();Emit(new{stage="restored",restored=true});}}catch(Exception e){Emit(new{stage="restore-pending",message=e.Message});}}
  }
}
