$ErrorActionPreference = 'Stop'
# npm may inherit PowerShell 7's module path when launching Windows PowerShell.
$env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
$project = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $project 'src-tauri/resources/player'
$archive = Join-Path $project 'node_modules/.cache/aster-mpv-v0.42.0.zip'
$expected = '8dd69cbab079086765fa5d873c09513b2834b85d146c1301718a757e8c0595ef'
New-Item -ItemType Directory -Force -Path (Split-Path $archive), $destination | Out-Null
if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    Invoke-WebRequest 'https://github.com/mpv-player/mpv/releases/download/v0.42.0/mpv-v0.42.0-x86_64-pc-windows-msvc.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Official mpv download failed checksum verification.' }
Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
Copy-Item -Path (Join-Path $project 'third-party/mpv/*') -Destination $destination -Recurse -Force
Write-Output 'Prepared verified mpv 0.42.0 with runtime DLL and redistribution notices.'
