using System;
using System.Collections.Generic;

static class WindowSelectionTest {
  static Win.WindowCandidate Candidate(int handle,uint pid,int w,int h){return new Win.WindowCandidate{Handle=new IntPtr(handle),Pid=pid,Width=w,Height=h};}
  static void Reject(Action call){try{call();}catch(Exception){return;}throw new Exception("Ambiguous or missing target was accepted");}
  static int Main(){
    using(var process=System.Diagnostics.Process.GetCurrentProcess()){
      long started=process.StartTime.ToUniversalTime().Ticks;
      if(Win.Started((uint)process.Id)!=started)throw new Exception("Native process creation time differs from the original identity check");
      if(!Win.AliveSince((uint)process.Id,started)||Win.AliveSince((uint)process.Id,started+1))throw new Exception("Parent lifetime identity check differs");
    }
    var windows=new List<Win.WindowCandidate>{Candidate(1,100,1920,1140),Candidate(2,100,1200,900),Candidate(3,100,1119,1205),Candidate(4,200,1920,1140)};
    var owned=new HashSet<uint>{100};
    if(Win.SelectCodexWindow(windows,owned,1920,1140)!=new IntPtr(1))throw new Exception("Main shell did not match");
    Reject(()=>Win.SelectCodexWindow(windows));
    Reject(()=>Win.SelectCodexWindow(windows,new HashSet<uint>{300},1920,1140));
    Reject(()=>Win.SelectCodexWindow(windows,owned,1100,740));
    windows.Add(Candidate(5,100,1920,1140));
    Reject(()=>Win.SelectCodexWindow(windows,owned,1920,1140));
    Console.WriteLine("PASS: verified shell excludes auxiliary windows and other sessions; ambiguity is rejected");return 0;
  }
}
