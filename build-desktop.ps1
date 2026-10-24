$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'scripts\build-native-aurora-v4.cjs');if($LASTEXITCODE -ne 0){throw 'Accepted aurora v4 renderer build failed'}
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'scripts\build-galaxy.cjs')){& node (Join-Path $PSScriptRoot 'scripts\build-galaxy.cjs');if($LASTEXITCODE -ne 0){throw 'Galaxy renderer build failed'}}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$framework=Split-Path $compiler;$wpf=Join-Path $framework 'WPF'
& $compiler /nologo /codepage:65001 /target:exe /platform:x64 /optimize+ /out:"$PSScriptRoot\NativeBridge.exe" /reference:"$wpf\WindowsBase.dll" /reference:"$wpf\UIAutomationClient.dll" /reference:"$wpf\UIAutomationTypes.dll" /reference:"$framework\Accessibility.dll" /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "$PSScriptRoot\src\native\Native.cs" "$PSScriptRoot\src\native\Bridge.cs"
if($LASTEXITCODE -ne 0){throw 'Native bridge compilation failed'}
& $compiler /nologo /codepage:65001 /target:winexe /platform:x64 /optimize+ /out:"$PSScriptRoot\CodexMagicDesktop.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "$PSScriptRoot\src\native\DesktopEntry.cs"
if($LASTEXITCODE -ne 0){throw 'Desktop entry compilation failed'}
Write-Output 'PASS: native bridge and desktop entry built.'
