$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File tests/skin-process.test.ps1
  if($LASTEXITCODE -ne 0){throw 'Skin process handoff checks failed'}
  & node --test tests/clock.test.cjs tests/adaptive-clock.test.cjs tests/native.test.cjs tests/startup-cover.test.cjs tests/stroke-batch.test.cjs
  if($LASTEXITCODE -ne 0){throw 'Clock or recovery guard checks failed'}
  $electron=Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'
  if(-not(Test-Path -LiteralPath $electron)){throw 'Run npm ci first'}
  $savedRunAsNode=$env:ELECTRON_RUN_AS_NODE
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  foreach($case in @('normal','delay','cancel')){
    $events=Join-Path $PSScriptRoot 'state\desktop\events.jsonl'
    $before=if(Test-Path -LiteralPath $events){@(Get-Content -LiteralPath $events).Count}else{0}
    $flags=@('.', '--synthetic','--diagnostic');if($case -ne 'normal'){$flags+="--$case-test"}
    $process=Start-Process -FilePath $electron -ArgumentList $flags -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    if(-not $process.WaitForExit(100000)){$process.Kill();throw "$case did not finish"}
    $process.Refresh();if($process.ExitCode -ne 0){throw "$case failed"}
    $lines=@(Get-Content -LiteralPath $events | Select-Object -Skip $before | ForEach-Object {$_ | ConvertFrom-Json})
    $finish=$lines | Where-Object stage -eq 'finish' | Select-Object -Last 1
    if(-not($lines | Where-Object {$_.stage -eq 'restored' -and $_.restored})){throw "$case did not confirm restoration"}
    if($case -eq 'normal' -and ($finish.reason -ne 'complete' -or $finish.elapsed -lt 12500)){throw 'Normal sequence did not finish correctly'}
    if($case -eq 'delay' -and (-not $finish.waiting -or $finish.elapsed -lt 20000 -or $finish.reason -ne 'complete')){throw 'Delayed readiness was not held correctly'}
    if($case -eq 'cancel' -and ($finish.reason -ne 'cancelled' -or $finish.elapsed -gt 8000)){throw 'Cancellation did not restore promptly'}
    if(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'state\desktop') -Filter 'recovery-*.json'){throw "$case left a recovery journal"}
    Write-Output "PASS: $case, elapsed=$($finish.elapsed)ms, restored=True"
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File tests/desktop-feedback.test.ps1
  if($LASTEXITCODE -ne 0){throw 'Desktop click feedback checks failed'}
} finally {
  $env:ELECTRON_RUN_AS_NODE=$savedRunAsNode
  Pop-Location
}
