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
    'build' {
        $asterSigning = Join-Path $PSScriptRoot '../../work/signing'
        if (Test-Path -LiteralPath (Join-Path $asterSigning 'aster-updater.key')) {
            $env:TAURI_SIGNING_PRIVATE_KEY = [IO.Path]::GetFullPath((Join-Path $asterSigning 'aster-updater.key'))
            $asterSecret = Import-Clixml -LiteralPath (Join-Path $asterSigning 'updater-password.xml')
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ([pscredential]::new('aster', $asterSecret)).GetNetworkCredential().Password
            try { & npm.cmd run desktop:build } finally { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY,Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
        } elseif ($env:TAURI_SIGNING_PRIVATE_KEY) { & npm.cmd run desktop:build }
        else { & npm.cmd run desktop:build -- --config src-tauri/tauri.unsigned.conf.json }
    }
    'test' { & npm.cmd test }
}
exit $LASTEXITCODE
