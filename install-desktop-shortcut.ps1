$ErrorActionPreference='Stop'
$target=Join-Path $PSScriptRoot 'CodexMagicDesktop.exe'
if(-not(Test-Path -LiteralPath $target)){throw 'Run build-desktop.ps1 first'}
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
$paths=@((Join-Path $desktop 'Codex · 白金法阵.lnk'))
$legacy=Join-Path $desktop 'Codex · 魔法启动.lnk'
if(Test-Path -LiteralPath $legacy){$paths+=$legacy}
# Validate every destination before changing either shortcut.
foreach($path in $paths){
  if(Test-Path -LiteralPath $path){
    $existing=$shell.CreateShortcut($path).TargetPath
    if($existing -ine $target -and -not($path -eq $legacy -and $existing -ieq (Join-Path $PSScriptRoot 'CodexMagic.exe'))){throw 'A different shortcut already uses this name; it was preserved.'}
  }
}
$backup=Join-Path $PSScriptRoot ('state\shortcuts-before-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($path in $paths){
  if(Test-Path -LiteralPath $path){Copy-Item -LiteralPath $path -Destination $backup}
  $link=$shell.CreateShortcut($path);$link.TargetPath=$target;$link.WorkingDirectory=$PSScriptRoot;$link.Arguments=''
  $link.Description='深空极光法阵：一键启动 Codex 与 Dream Skin'
  $link.Save();Write-Output $path
}
