param(
    [ValidateSet('Local', 'Production')][string]$Mode = 'Local',
    [ValidateRange(1024, 65535)][int]$ServerPort = 3004,
    [string]$ProductionOrigin = 'https://tomatoes-reports.vercel.app',
    [switch]$Run,
    [switch]$ShowEmulator
)
. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-TomatoesJava
$sdk = Get-TomatoesAndroidSdk
if (-not (Test-Path -LiteralPath (Join-Path $sdk 'platforms/android-36/android.jar'))) { throw 'Install Android SDK Platform 36 in Android Studio / SDK Manager.' }
$origin = $null
if (-not [Uri]::TryCreate($ProductionOrigin, [UriKind]::Absolute, [ref]$origin) -or $origin.Scheme -ne 'https' -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/') { throw 'ProductionOrigin must be an HTTPS origin without credentials, paths, queries or fragments.' }
$ProductionOrigin = $origin.GetLeftPart([UriPartial]::Authority)
$node = (Get-Command node -ErrorAction Stop).Source
$project = Join-Path $AndroidRepoRoot 'android'
$sdkProperty = 'sdk.dir=' + $sdk.Replace('\', '/')
[IO.File]::WriteAllText((Join-Path $project 'local.properties'), $sdkProperty + "`n", (New-Object Text.UTF8Encoding($false)))
$artifacts = Join-Path $AndroidRepoRoot 'artifacts/android'
[IO.Directory]::CreateDirectory($artifacts) | Out-Null
if ($Mode -eq 'Production') {
    if (-not $env:TOMATOES_ANDROID_KEYSTORE) {
        if ($env:CI) { throw 'CI release builds require TOMATOES_ANDROID_KEYSTORE and signing password environment variables.' }
        $private = Join-Path $AndroidRepoRoot '.tomatoes-data/android-signing'
        [IO.Directory]::CreateDirectory($private) | Out-Null
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        & icacls.exe $private /inheritance:r /grant:r "*$($identity):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the private Android signing directory.' }
        $credentialsFile = Join-Path $private 'signing.json'
        $keyFile = Join-Path $private 'tomatoes-release.p12'
        if (-not (Test-Path -LiteralPath $credentialsFile)) {
            $existingAssociation = Join-Path $AndroidRepoRoot 'public/.well-known/assetlinks.json'
            if ((Test-Path -LiteralPath $existingAssociation) -and @((Get-Content -LiteralPath $existingAssociation -Raw | ConvertFrom-Json)).Count -gt 0) {
                throw 'This app already has a release certificate. Restore .tomatoes-data/android-signing or supply your existing keystore through the signing environment variables. Refusing to create a replacement signing identity.'
            }
            if (Test-Path -LiteralPath $keyFile) { throw 'Existing release keystore found without its credentials. Restore signing.json; refusing to replace the key.' }
            $random = New-Object byte[] 32
            $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $generator.GetBytes($random) } finally { $generator.Dispose() }
            $password = [Convert]::ToBase64String($random)
            $credentials = @{ storePassword = $password; keyPassword = $password; alias = 'tomatoes' }
            [IO.File]::WriteAllText($credentialsFile, ($credentials | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
            $env:TOMATOES_ANDROID_STORE_PASSWORD = $password
            Invoke-AndroidChecked (Join-Path $env:JAVA_HOME 'bin/keytool.exe') @('-genkeypair', '-keystore', $keyFile, '-storetype', 'PKCS12', '-alias', 'tomatoes', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', 'CN=Tomatoes Android', '-storepass:env', 'TOMATOES_ANDROID_STORE_PASSWORD', '-keypass:env', 'TOMATOES_ANDROID_STORE_PASSWORD', '-noprompt')
            Write-Host 'Created a private release signing key. Back up .tomatoes-data/android-signing securely; it is required for future app updates.'
        }
        $credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
        $env:TOMATOES_ANDROID_KEYSTORE = $keyFile
        $env:TOMATOES_ANDROID_STORE_PASSWORD = $credentials.storePassword
        $env:TOMATOES_ANDROID_KEY_PASSWORD = $credentials.keyPassword
        $env:TOMATOES_ANDROID_KEY_ALIAS = $credentials.alias
    }
    if (-not (Test-Path -LiteralPath $env:TOMATOES_ANDROID_KEYSTORE) -or -not $env:TOMATOES_ANDROID_STORE_PASSWORD) { throw 'Provide a valid release keystore and its password environment variables.' }
    if (-not $env:TOMATOES_ANDROID_KEY_ALIAS) { $env:TOMATOES_ANDROID_KEY_ALIAS = 'tomatoes' }
    $certificate = Join-Path $artifacts 'tomatoes-release.cer'
    Invoke-AndroidChecked (Join-Path $env:JAVA_HOME 'bin/keytool.exe') @('-exportcert', '-keystore', $env:TOMATOES_ANDROID_KEYSTORE, '-alias', $env:TOMATOES_ANDROID_KEY_ALIAS, '-storepass:env', 'TOMATOES_ANDROID_STORE_PASSWORD', '-file', $certificate)
    $fingerprint = (([regex]::Matches((Get-TomatoesSHA256 $certificate), '..') | ForEach-Object { $_.Value }) -join ':')
    $linksFile = Join-Path $AndroidRepoRoot 'public/.well-known/assetlinks.json'
    Invoke-AndroidChecked $node @((Join-Path $PSScriptRoot 'write-assetlinks.js'), $fingerprint)
    Copy-Item -LiteralPath $linksFile -Destination (Join-Path $artifacts 'assetlinks.json') -Force
}
Invoke-AndroidChecked $node @((Join-Path $AndroidRepoRoot 'scripts/build.js'))
$wrapper = Join-Path $project 'gradlew.bat'
if (-not (Test-Path -LiteralPath $wrapper)) { throw 'Gradle wrapper is missing. Restore android/gradlew.bat and android/gradle/wrapper from the repository.' }
$task = if ($Mode -eq 'Local') { 'assembleLocalDebug' } else { 'assembleProductionRelease' }
$versionCode = if ($env:TOMATOES_ANDROID_VERSION_CODE) { $env:TOMATOES_ANDROID_VERSION_CODE } else { '1' }
$versionName = if ($env:TOMATOES_ANDROID_VERSION_NAME) { $env:TOMATOES_ANDROID_VERSION_NAME } else { '1.0.0' }
if ($versionCode -notmatch '^[1-9][0-9]{0,8}$' -or $versionName -notmatch '^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9]+)*$') { throw 'Use a positive integer version code and semantic version name.' }
Push-Location $project
try { Invoke-AndroidChecked $wrapper @('--console=plain', '--no-daemon', $task, "-PtomatoesLocalPort=$ServerPort", "-PtomatoesProductionOrigin=$ProductionOrigin", "-PtomatoesVersionCode=$versionCode", "-PtomatoesVersionName=$versionName") } finally { Pop-Location }
$variant = if ($Mode -eq 'Local') { 'local/debug/app-local-debug.apk' } else { 'production/release/app-production-release.apk' }
$source = Join-Path $project "app/build/outputs/apk/$variant"
$filename = if ($Mode -eq 'Local') { 'tomatoes-local-debug.apk' } else { 'tomatoes-production-release.apk' }
$output = Join-Path $artifacts $filename
Copy-Item -LiteralPath $source -Destination $output -Force
$apksigner = Join-Path $sdk 'build-tools/36.0.0/apksigner.bat'
Invoke-AndroidChecked $apksigner @('verify', '--verbose', $output)
Test-TomatoesApk -Sdk $sdk -ApkPath $output -Mode $Mode
(Get-TomatoesSHA256 $output) | Set-Content -LiteralPath ($output + '.sha256') -Encoding ascii
Write-Host "APK ready: $output"
if ($Run) {
    $package = if ($Mode -eq 'Local') { 'com.tomatoes.reports.local' } else { 'com.tomatoes.reports' }
    & (Join-Path $PSScriptRoot 'emulator.ps1') -ApkPath $output -PackageId $package -LocalPort $(if ($Mode -eq 'Local') { $ServerPort } else { 0 }) -ShowEmulator:$ShowEmulator
}
