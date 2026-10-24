using System;
using System.Diagnostics;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
[assembly:System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly:System.Reflection.AssemblyFileVersion("1.0.0.0")]
sealed class LaunchFeedback : Form {
  readonly Timer timer=new Timer{Interval=33};
  readonly Stopwatch clock=Stopwatch.StartNew();
  readonly string acknowledgement;
  readonly bool reducedMotion=!SystemInformation.IsMinimizeRestoreAnimationEnabled;
  Process child;
  public LaunchFeedback(string path){
    acknowledgement=path;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;
    BackColor=Color.Magenta;TransparencyKey=BackColor;DoubleBuffered=true;ClientSize=new Size(280,100);
    var area=Screen.PrimaryScreen.WorkingArea;StartPosition=FormStartPosition.Manual;
    Location=new Point(area.Left+(area.Width-Width)/2,area.Top+(int)(area.Height*.75)-Height/2);
    timer.Tick+=delegate{
      if(File.Exists(acknowledgement)||clock.ElapsedMilliseconds>15000||(child!=null&&child.HasExited)){Close();return;}
      Invalidate();
    };
    timer.Start();
  }
  protected override bool ShowWithoutActivation{get{return true;}}
  protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x080000A0;return p;}}
  public void Watch(Process process){child=process;}
  protected override void OnPaint(PaintEventArgs e){
    base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
    float t=(float)clock.Elapsed.TotalSeconds,angle=reducedMotion?0:t*75;
    using(var pen=new Pen(Color.FromArgb(145,191,217),1.4f)){
      g.DrawArc(pen,18,35,27,27,angle,240);g.DrawArc(pen,23,40,17,17,-angle,125);
    }
    using(var font=new Font("Palatino Linotype",29,FontStyle.Italic))
    using(var brush=new LinearGradientBrush(new Rectangle(60,8,165,50),Color.FromArgb(187,221,245),Color.FromArgb(210,191,237),0f))g.DrawString("codex",font,brush,60,8);
    using(var font=new Font("Microsoft YaHei UI",10))using(var brush=new SolidBrush(Color.FromArgb(185,202,220)))g.DrawString("正在唤醒星域…",font,brush,64,57);
    using(var pen=new Pen(Color.FromArgb(132,190,200),1)){
      float pulse=reducedMotion?0:(float)Math.Sin(t*1.5)*3;g.DrawBezier(pen,61,87+ pulse,110,77,164,94,220,82-pulse);
    }
  }
  protected override void OnFormClosed(FormClosedEventArgs e){timer.Dispose();if(File.Exists(acknowledgement))File.Delete(acknowledgement);base.OnFormClosed(e);}
}
static class DesktopEntry {
  [STAThread]static int Main(string[] args){
    try{
      string root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
      string electron=Path.Combine(root,"runtime","electron","electron.exe");
      if(!File.Exists(electron))electron=Path.Combine(root,"node_modules","electron","dist","electron.exe");
      if(!File.Exists(electron)||!File.Exists(Path.Combine(root,"NativeBridge.exe")))throw new Exception("请先运行首版构建脚本，准备启动运行时。");
      string flags="";foreach(string arg in args){if(arg=="--reuse-only"||arg=="--diagnostic"||arg=="--synthetic"||arg=="--cancel-test"||arg=="--delay-test")flags+=" "+arg;}
      string token=Guid.NewGuid().ToString("N"),state=Path.Combine(root,"state","desktop");Directory.CreateDirectory(state);
      string acknowledgement=Path.Combine(state,"launch-feedback-"+token+".ready");
      flags+=" --launch-feedback="+token;
      Application.EnableVisualStyles();
      using(var feedback=new LaunchFeedback(acknowledgement)){
      feedback.Show();feedback.Refresh();
      File.AppendAllText(Path.Combine(state,"events.jsonl"),"{\"at\":\""+DateTime.UtcNow.ToString("o")+"\",\"stage\":\"launch-feedback-visible\"}\n");
      var start=new ProcessStartInfo{FileName=electron,Arguments="\""+root+"\""+flags,WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true};
      start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
      feedback.Watch(Process.Start(start));Application.Run(feedback);
      }return 0;
    }catch(Exception e){MessageBox.Show(e.Message,"Codex 魔法启动器",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
  }
}
