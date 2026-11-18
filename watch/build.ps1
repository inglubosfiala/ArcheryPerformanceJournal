# Builds the watch app with the Connect IQ SDK chosen in the SDK Manager ("Use as current SDK").
#   .\build.ps1          debug build for the simulator (bin\ArrowGrades.prg) and runs it on epix2
#   .\build.ps1 -Store   store package (bin\ArrowGrades.iq) to upload as a beta app
param([switch]$Store, [string]$Key = "$env:USERPROFILE\.garmin\developer_key.der")
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$cfg = Join-Path $env:APPDATA 'Garmin\ConnectIQ\current-sdk.cfg'
if (-not (Test-Path $cfg)) { throw "No current Connect IQ SDK. Open the SDK Manager, download an SDK and click 'Use as current SDK'." }
$sdk = (Get-Content $cfg -Raw).Trim()
$bin = Join-Path $sdk 'bin'
New-Item -ItemType Directory -Force bin | Out-Null

if ($Store) {
    & "$bin\monkeyc.bat" -e -r -w -f monkey.jungle -y $Key -o bin\ArrowGrades.iq
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Write-Host "Store package: $PSScriptRoot\bin\ArrowGrades.iq"
} else {
    & "$bin\monkeyc.bat" -w -f monkey.jungle -y $Key -d epix2 -o bin\ArrowGrades.prg
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Start-Process "$bin\simulator.exe"
    Start-Sleep -Seconds 4
    & "$bin\monkeydo.bat" bin\ArrowGrades.prg epix2
}
