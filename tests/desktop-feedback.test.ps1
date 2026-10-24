$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$events=Join-Path $repo 'state\desktop\events.jsonl'
$before=@(Get-Content -LiteralPath $events).Count
$watch=[Diagnostics.Stopwatch]::StartNew()
$entry=Start-Process -FilePath (Join-Path $repo 'CodexMagicDesktop.exe') -ArgumentList @('--synthetic','--diagnostic','--cancel-test') -WindowStyle Hidden -PassThru
$feedbackMs=$null;$deadline=(Get-Date).AddSeconds(25)
do {
  Start-Sleep -Milliseconds 80
  $lines=@(Get-Content -LiteralPath $events | Select-Object -Skip $before | ForEach-Object {$_|ConvertFrom-Json})
  if($null -eq $feedbackMs -and @($lines|Where-Object stage -eq 'launch-feedback-visible').Count){$feedbackMs=$watch.ElapsedMilliseconds}
  $finish=$lines|Where-Object stage -eq 'finish'|Select-Object -Last 1
  $restored=@($lines|Where-Object {$_.stage -eq 'restored' -and $_.restored}).Count -gt 0
}while((-not $finish -or -not $restored) -and (Get-Date) -lt $deadline)
$entry.Refresh()
if($finish.reason -ne 'cancelled' -or -not $restored){throw 'Desktop entry did not restore after synthetic cancellation'}
if($null -eq $feedbackMs -or $feedbackMs -gt 2000){throw 'Click feedback was delayed'}
if(-not $entry.HasExited){throw 'Initial feedback did not yield to the full animation'}
if(Get-ChildItem -LiteralPath (Join-Path $repo 'state\desktop') -Filter 'launch-feedback-*.ready'){throw 'Feedback acknowledgement left behind'}
$report=@{ok=$true;feedbackObservedWithinMs=$feedbackMs;syntheticReason=$finish.reason;restored=$restored;entryExited=$entry.HasExited}
[IO.File]::WriteAllText((Join-Path $repo 'state\desktop\feedback-check.json'),($report|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output "PASS: desktop click feedback within ${feedbackMs}ms; synthetic cancellation restored; feedback exited."
