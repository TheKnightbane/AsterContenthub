param([ValidateSet('desktop', 'web', 'build', 'test')][string]$Mode = 'desktop')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$workspaceTools = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\work\tools'))
if (Test-Path -LiteralPath "$workspaceTools\bin\npm.cmd") {
    $env:PATH = "$workspaceTools\bin;$env:PATH"
}
if (Test-Path -LiteralPath "$workspaceTools\cargo\bin\cargo.exe") {
    $env:CARGO_HOME = "$workspaceTools\cargo"
    $env:RUSTUP_HOME = "$workspaceTools\rustup"
    $env:PATH = "$workspaceTools\cargo\bin;$env:PATH"
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS including npm, then run this script again.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
switch ($Mode) {
    'desktop' { & npm.cmd run desktop }
    'web' { & npm.cmd run dev }
    'build' { & npm.cmd run desktop:build }
    'test' { & npm.cmd test }
}
exit $LASTEXITCODE
