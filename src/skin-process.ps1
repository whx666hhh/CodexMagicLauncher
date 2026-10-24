# Keep JSON stdout independent of Node/PowerShell warnings on stderr.
# Argument quoting is supplied by the installed, identity-checked engine.
function Invoke-LauncherSkinProcess {
  param([string]$FilePath,[string[]]$ArgumentList=@(),[int]$TimeoutMilliseconds=0,[switch]$NoCapture)
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$FilePath
  $start.Arguments=ConvertTo-DreamSkinArgumentLine -Arguments $ArgumentList
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=-not $NoCapture;$start.RedirectStandardError=-not $NoCapture
  if(-not $NoCapture){
    $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $start.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
  }
  $process=[Diagnostics.Process]::Start($start)
  try {
    if(-not $NoCapture){$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()}
    if($TimeoutMilliseconds -gt 0){
      if(-not $process.WaitForExit($TimeoutMilliseconds)){
        # This helper owns only the child it started; never kill Codex here.
        $process.Kill();$process.WaitForExit();throw '皮肤辅助检查超时。'
      }
    }else{$process.WaitForExit()}
    # A launcher can leave a long-lived Codex child holding its output handles.
    # Its exit code and ResultToken file are sufficient; do not wait for pipe EOF.
    if($NoCapture){return [pscustomobject]@{ExitCode=$process.ExitCode;Output='';ErrorOutput=''}}
    return [pscustomobject]@{ExitCode=$process.ExitCode;Output=$stdout.Result;ErrorOutput=$stderr.Result}
  }finally{$process.Dispose()}
}
