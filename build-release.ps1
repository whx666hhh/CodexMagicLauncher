[CmdletBinding()]
param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference='Stop'
$version=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$files=@((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'scripts/release-files.json') -Raw | ConvertFrom-Json).files)+@('CodexMagicDesktop.exe','NativeBridge.exe')
foreach($file in $files){
  $source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot $file))
  if(-not $source.StartsWith($PSScriptRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw "File outside project: $file"}
  if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw "Missing release file: $file"}
}
$runtime=Join-Path $PSScriptRoot 'node_modules\electron\dist'
if(-not(Test-Path -LiteralPath (Join-Path $runtime 'electron.exe'))){throw 'Run npm ci first'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$name="CodexMagicLauncher-$version-win-x64"
$stage=Join-Path $output $name
if(Test-Path -LiteralPath $stage){throw "Output already exists; preserve it or choose another directory: $stage"}
New-Item -ItemType Directory -Path (Join-Path $stage 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') -Force | Out-Null
# Explicit release boundary: never recursively copy the project or state.
foreach($file in $files){
  $destination=Join-Path $stage $file
  New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination
}
Copy-Item -LiteralPath $runtime -Destination (Join-Path $stage 'runtime\electron') -Recurse
$zip=Join-Path $output ($name+'.zip')
if(Test-Path -LiteralPath $zip){throw 'Release zip already exists'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
$hash=Get-FileHash -LiteralPath $zip -Algorithm SHA256
[IO.File]::WriteAllText(($zip+'.sha256'),($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($zip)+"`n"),[Text.UTF8Encoding]::new($false))
Write-Output $zip
Write-Output "SHA256=$($hash.Hash)"
