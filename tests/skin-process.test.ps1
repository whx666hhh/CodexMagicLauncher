$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine\scripts\common-windows.ps1')
. (Join-Path $repo 'src\skin-process.ps1')
$node=(Get-DreamSkinNodeRuntime).Path
$temp=Join-Path ([IO.Path]::GetTempPath()) ('LauncherSkinTest-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $fixture=Join-Path $temp 'warning fixture.cjs'
  [IO.File]::WriteAllText($fixture,'process.stderr.write("harmless warning\n");process.stdout.write(JSON.stringify({pass:true,value:process.argv[2]}));',[Text.UTF8Encoding]::new($false))
  $result=Invoke-LauncherSkinProcess -FilePath $node -ArgumentList @($fixture,'a path with spaces\') -TimeoutMilliseconds 5000
  if($result.ExitCode -ne 0 -or ($result.Output|ConvertFrom-Json).value -cne 'a path with spaces\' -or $result.ErrorOutput -notmatch 'harmless warning'){throw 'JSON and warnings were not separated correctly'}
  [IO.File]::WriteAllText($fixture,'process.stderr.write("real failure");process.exit(7)',[Text.UTF8Encoding]::new($false))
  $result=Invoke-LauncherSkinProcess -FilePath $node -ArgumentList @($fixture) -TimeoutMilliseconds 5000
  if($result.ExitCode -ne 7 -or $result.ErrorOutput -notmatch 'real failure'){throw 'A real helper failure was hidden'}
  $timedOut=$false
  [IO.File]::WriteAllText($fixture,'setTimeout(()=>{},30000)',[Text.UTF8Encoding]::new($false))
  try{$null=Invoke-LauncherSkinProcess -FilePath $node -ArgumentList @($fixture) -TimeoutMilliseconds 100}catch{$timedOut=$_.Exception.Message -match '超时'}
  if(-not $timedOut){throw 'Hung helper did not time out'}
  $launcherFixture=Join-Path $temp 'background launcher.ps1'
  [IO.File]::WriteAllText($launcherFixture,'param($Node); $null=Start-Process -FilePath $Node -ArgumentList ''-e "setTimeout(()=>{},6000)"'' -NoNewWindow -PassThru',[Text.UTF8Encoding]::new($false))
  $watch=[Diagnostics.Stopwatch]::StartNew()
  $result=Invoke-LauncherSkinProcess -NoCapture -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcherFixture,$node) -TimeoutMilliseconds 3000
  if($result.ExitCode -ne 0 -or $watch.ElapsedMilliseconds -ge 3000 -or $result.Output -ne ''){throw 'Launcher waited for inherited background output handles'}
  Write-Output 'PASS: JSON/warnings separated; spaced arguments; real failure; owned timeout; background output cannot block launcher exit.'
}finally{
  # The directory is uniquely created above under the system temp directory.
  $resolved=[IO.Path]::GetFullPath($temp)
  if($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -match '^LauncherSkinTest-[a-f0-9]{32}$'){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
