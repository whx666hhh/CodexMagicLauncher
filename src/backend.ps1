[CmdletBinding()]
param([switch]$ProbeOnly,[switch]$ReuseOnly,[switch]$WaitForCover)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Emit([string]$Stage, [hashtable]$Data = @{}) {
  $Data.stage = $Stage
  [Console]::WriteLine('@MAGIC ' + ($Data | ConvertTo-Json -Compress -Depth 5))
}
try {
  # Reuse the installed engine. Do not reinstall or downgrade it via the old
  # skill cache; an update may have replaced the installed selectors.
  $engineRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
  $scripts = Join-Path $engineRoot 'scripts'
  foreach ($name in @('common-windows.ps1','theme-windows.ps1','start-dream-skin.ps1','injector.mjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $scripts $name) -PathType Leaf)) {
      throw '请先安装 Codex Dream Skin，再使用魔法启动器。'
    }
  }
  . (Join-Path $scripts 'common-windows.ps1')
  . (Join-Path $scripts 'theme-windows.ps1')
  . (Join-Path $PSScriptRoot 'skin-process.ps1')
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $clock = [Diagnostics.Stopwatch]::StartNew()
  function Probe {
    $state = Read-DreamSkinState -Path (Join-Path $stateRoot 'state.json')
    if ($null -eq $state) { return $null }
    $codex = Get-DreamSkinCodexInstallFromState -State $state
    if ($null -eq $codex) { return $null }
    $identity = Get-DreamSkinVerifiedCdpIdentity -Port ([int]$state.port) -Codex $codex
    if ($null -eq $identity -or $identity.BrowserId -cne $state.browserId) { return $null }
    if (Test-DreamSkinPaused -StateRoot $stateRoot) { return $null }
    $node = Get-DreamSkinNodeRuntime
    $theme = Get-DreamSkinThemePaths -StateRoot $stateRoot
    $verify = Invoke-LauncherSkinProcess -FilePath $node.Path -TimeoutMilliseconds 10000 -ArgumentList @(
      (Join-Path $scripts 'injector.mjs'), '--verify','--port',"$($state.port)",
      '--browser-id',$identity.BrowserId,'--theme-dir',$theme.Active,'--timeout-ms','2500')
    if ($verify.ExitCode -ne 0) { return $null }
    try { $payload = $verify.Output | ConvertFrom-Json } catch { return $null }
    $valid = @($payload.targets | Where-Object {
      $_.result.pass -eq $true -and $_.result.readiness.documentPass -eq $true -and
      $_.result.readiness.viewportPass -eq $true -and $_.result.readiness.structurePass -eq $true
    })
    if ($valid.Count -eq 0) { return $null }
    return @{state=$state; codex=$codex; node=$node; target=$valid[0].targetId}
  }
  Emit 'checking'
  $ready = Probe
  if ($null -eq $ready -and $ProbeOnly) { Emit 'not-ready'; exit 2 }
  if ($null -eq $ready -and $ReuseOnly) { Emit 'cancelled'; exit 3 }
  if ($null -eq $ready) {
    # Confirm with the installed engine's native dialog first. Once accepted,
    # the fresh overlay must be fully opaque before that engine may relaunch.
    $isOpen = $false
    foreach ($candidate in @(Get-DreamSkinRegisteredCodexInstalls)) {
      if (@(Get-DreamSkinCodexProcesses -Codex $candidate).Count -gt 0) { $isOpen = $true; break }
    }
    $restartConfirmed=$false
    if ($isOpen) {
      Emit 'consent'; Start-Sleep -Milliseconds 150
      if(-not (Confirm-DreamSkinRestart -Message '为让 Codex 第一次显现时就带上当前 Dream Skin，需要重新启动 Codex。未发送的输入可能丢失。是否继续？')){Emit 'cancelled';exit 3}
      $restartConfirmed=$true
      Emit 'consent-approved'
    }
    if($WaitForCover){
      # Bind acknowledgement to this request so a pre-consent frame cannot
      # accidentally authorize a post-consent launch.
      $coverToken=[Guid]::NewGuid().ToString('N')
      Emit 'working' @{coverToken=$coverToken}
      $covered=[Console]::In.ReadLineAsync()
      if(-not $covered.Wait(15000) -or $covered.Result -cne ('covered:'+$coverToken)){throw '开场覆盖层未就绪，本次未启动 Codex。'}
    }else{Emit 'working'}
    $restartArgument=if($restartConfirmed){'-RestartExisting'}else{'-PromptRestart'}
    $resultToken=[Guid]::NewGuid().ToString('N')
    $startResult=Invoke-LauncherSkinProcess -NoCapture -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @(
      '-NoProfile','-STA','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',
      (Join-Path $scripts 'start-dream-skin.ps1'),$restartArgument,'-OperationLockTimeoutMilliseconds','10000','-ResultToken',$resultToken)
    if ($startResult.ExitCode -ne 0) {
      $category='internal-start-failure'
      try {$detail=Read-DreamSkinStartResult -StateRoot $stateRoot -Token $resultToken;$category=$detail.category} catch {}
      $messages=@{
        'renderer-verification-failed'='皮肤未能识别或验证当前 Codex 界面。'
        'cdp-launch-failed'='Dream Skin 未能启动可验证的 Codex 会话。'
        'cdp-direct-access-denied'='系统拒绝了 Dream Skin 的 Codex 启动请求。'
        'cdp-endpoint-unavailable'='Codex 已启动，但皮肤连接未就绪。'
        'port-unavailable'='Dream Skin 的本地连接被其他程序占用。'
        'state-reconciliation-failed'='Dream Skin 的旧会话状态需要恢复。'
        'injector-start-failed'='Dream Skin 的皮肤进程未能启动。'
        'superseded'='此次皮肤应用已被更新的暂停或切换操作取消。'
      }
      $message=$messages[$category];if(-not $message){$message='Codex 或 Dream Skin 启动失败。'}
      Emit 'skin-failed' @{category=$category;elapsed=$clock.Elapsed.TotalSeconds}
      throw ($message+' 动画已恢复；请查看 Dream Skin 的验证日志。')
    }
    $ready = Probe
    if ($null -eq $ready) { Emit 'cancelled'; exit 3 }
  }
  # Select a real visible native window owned by this verified package only.
  if (-not $ProbeOnly) { [void](Invoke-DreamSkinCodexWindowActivation -Codex $ready.codex) }
  $windows = @(@(Get-DreamSkinCodexProcesses -Codex $ready.codex) | ForEach-Object {
    Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  } | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
  $window = $windows | Select-Object -First 1
  if ($null -eq $window) { throw 'Codex 已加载，但尚未找到可显示的真实窗口。' }
  if ($ProbeOnly) {
    Emit 'ready' @{verified=$true;elapsed=$clock.Elapsed.TotalSeconds;engineVersion=([IO.File]::ReadAllText((Join-Path $engineRoot 'VERSION')).Trim())}
    exit 0
  }
  $metadata = Invoke-LauncherSkinProcess -FilePath $ready.node.Path -TimeoutMilliseconds 15000 -ArgumentList @(
    (Join-Path $PSScriptRoot 'ready-ui.mjs'),"$($ready.state.port)",$ready.state.browserId,$ready.target)
  if ($metadata.ExitCode -ne 0) { throw '真实界面尚未就绪，动画已退出，Codex 保持可用。' }
  $uiInfo = $metadata.Output | ConvertFrom-Json
  $ownedPids = @(Get-DreamSkinCodexProcesses -Codex $ready.codex | ForEach-Object { [int]$_.ProcessId })
  Emit 'ready' @{verified=$true;elapsed=$clock.Elapsed.TotalSeconds;pids=$ownedPids;colors=$uiInfo.colors;width=$uiInfo.width;height=$uiInfo.height;deviceScale=$uiInfo.deviceScale;layoutReader=@{node=$ready.node.Path;port=[int]$ready.state.port;browser=$ready.state.browserId;target=$ready.target}}
} catch {
  Emit 'failed' @{message=$_.Exception.Message}
  exit 1
}
