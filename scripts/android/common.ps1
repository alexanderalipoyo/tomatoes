Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AndroidRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Get-TomatoesAndroidSdk {
    $candidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android/Sdk'))
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'platform-tools/adb.exe'))) { return [IO.Path]::GetFullPath($candidate) }
    }
    throw 'Android SDK not found. Install Android Studio and set ANDROID_HOME to its SDK directory.'
}
function Initialize-TomatoesJava {
    $candidates = @($env:JAVA_HOME, 'C:/Program Files/Android/Android Studio/jbr')
    $java = Get-Command java -ErrorAction SilentlyContinue
    if ($java) { $candidates += Split-Path (Split-Path $java.Source -Parent) -Parent }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'bin/javac.exe'))) {
            $env:JAVA_HOME = [IO.Path]::GetFullPath($candidate)
            $env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
            return
        }
    }
    throw 'JDK not found. Install Android Studio or JDK 21 and set JAVA_HOME.'
}
function Invoke-AndroidChecked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Android command failed ($LASTEXITCODE): $([IO.Path]::GetFileName($Executable))" }
}

function Get-TomatoesSHA256 {
    param([string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
    finally { $hash.Dispose(); $stream.Dispose() }
}

function Test-TomatoesApk {
    param([string]$Sdk, [string]$ApkPath, [string]$Mode)
    $badging = @(& (Join-Path $Sdk 'build-tools/36.0.0/aapt.exe') dump badging $ApkPath)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the built APK manifest.' }
    $expectedPackage = if ($Mode -eq 'Local') { 'com.tomatoes.reports.local' } else { 'com.tomatoes.reports' }
    if (-not ($badging | Select-String -SimpleMatch "package: name='$expectedPackage'")) { throw 'APK package does not match its requested environment.' }
    if ($Mode -eq 'Production' -and ($badging | Select-String -SimpleMatch 'application-debuggable')) { throw 'The production APK must not be debuggable.' }
    if (-not ($badging | Select-String -SimpleMatch "targetSdkVersion:'36'")) { throw 'Unexpected APK target SDK.' }
    Write-Host "Verified APK environment: $Mode ($expectedPackage, target SDK 36)."
}
