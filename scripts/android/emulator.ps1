param(
    [Parameter(Mandatory=$true)][string]$ApkPath,
    [ValidateSet('com.tomatoes.reports', 'com.tomatoes.reports.local')][string]$PackageId = 'com.tomatoes.reports.local',
    [ValidateRange(0, 65535)][int]$LocalPort = 0,
    [switch]$ShowEmulator
)
. (Join-Path $PSScriptRoot 'common.ps1')
$sdk = Get-TomatoesAndroidSdk
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$emulator = Join-Path $sdk 'emulator/emulator.exe'
$avdName = 'Pixel_10_Pro'
$config = Join-Path $env:USERPROFILE '.android/avd/Pixel_10_Pro.avd/config.ini'
if (-not (Test-Path -LiteralPath $config) -or -not (Select-String -LiteralPath $config -Pattern '^hw.device.name=pixel_10_pro$' -Quiet)) { throw 'Create a Pixel 10 Pro AVD named Pixel_10_Pro in Android Studio / Device Manager first.' }
if (-not (Test-Path -LiteralPath $ApkPath)) { throw 'Build the APK first; its file was not found.' }
if ($LocalPort) {
    try { Invoke-WebRequest "http://localhost:$LocalPort/api/team/status" -UseBasicParsing -TimeoutSec 10 | Out-Null }
    catch { throw "Start the local Tomatoes server on port $LocalPort before launching the local APK." }
}
$serial = $null
$devices = @(& $adb devices | Select-String '^emulator-[0-9]+\s+device$' | ForEach-Object { ($_.Line -split '\s+')[0] })
foreach ($device in $devices) {
    $name = @(& $adb -s $device emu avd name 2>$null)
    if ($name -contains $avdName) { $serial = $device; break }
}
if (-not $serial) {
    $port = 0
    $usedPorts = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
    foreach ($candidate in 5554,5556,5558,5560,5562,5564) {
        if ($candidate -notin $usedPorts) { $port = $candidate; break }
    }
    if (-not $port) { throw 'No free Android emulator console port was found.' }
    $emulatorArguments = @('-avd', $avdName, '-port', "$port", '-no-audio', '-no-boot-anim', '-gpu', 'software', '-memory', '2048')
    if (-not $ShowEmulator) { $emulatorArguments += '-no-window' }
    $logRoot = Join-Path $AndroidRepoRoot '.tomatoes-data'
    [IO.Directory]::CreateDirectory($logRoot) | Out-Null
    Start-Process -FilePath $emulator -ArgumentList $emulatorArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'android-emulator.stdout.log') -RedirectStandardError (Join-Path $logRoot 'android-emulator.stderr.log') | Out-Null
    $serial = "emulator-$port"
}
Write-Host "Waiting for Pixel 10 Pro ($serial)..."
$deadline = [DateTime]::UtcNow.AddMinutes(5)
$booted = $false
while ([DateTime]::UtcNow -lt $deadline) {
    try { $state = @(& $adb -s $serial shell getprop sys.boot_completed 2>$null) }
    catch { $state = @() }
    if ($state -contains '1') { $booted = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $booted) { throw 'Pixel 10 Pro did not finish booting within five minutes. Check the emulator logs and Android Studio virtualization settings.' }
if ($LocalPort) { Invoke-AndroidChecked $adb @('-s', $serial, 'reverse', "tcp:$LocalPort", "tcp:$LocalPort") }
Invoke-AndroidChecked $adb @('-s', $serial, 'install', '-r', ([IO.Path]::GetFullPath($ApkPath)))
Invoke-AndroidChecked $adb @('-s', $serial, 'shell', 'am', 'start', '-n', "$PackageId/com.tomatoes.reports.MainActivity")
Write-Host "Installed and launched $PackageId on Pixel 10 Pro."
