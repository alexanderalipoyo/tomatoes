# Android APK builds

Tomatoes includes a native Android launcher powered by Google's Android Browser Helper. It opens the existing responsive React app in the device browser as a Trusted Web Activity when site ownership is verified, with a Custom Tab fallback otherwise. The Node API and PostgreSQL stay on your server. No database credentials, private environment files, or signing secrets are bundled into the APK. A network connection is required; this is a browser-backed Android app, not an offline copy of the backend or a React Native rewrite.

## Requirements

- Windows, Node 24, Java/JDK 21 or Android Studio's bundled JDK.
- Android Studio with SDK Platform 36, Build Tools 36.0.0, Platform Tools and Emulator installed. The scripts find `%LOCALAPPDATA%/Android/Sdk`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`.
- An AVD named **Pixel_10_Pro**, using the **Pixel 10 Pro** hardware profile. Create it in Android Studio / Device Manager if missing. The scripts do not replace or wipe existing virtual devices.
- Run `npm ci` after a fresh checkout. The checked-in Gradle wrapper downloads a checksum-verified Gradle 8.14.3 distribution. Gradle resolves pinned Android Gradle Plugin 8.13.2 and Android Browser Helper 2.6.2.

This machine already has a Pixel 10 Pro AVD with a Google Play x86_64 image (`android-37.2`, runtime SDK 37). Both APK variants were installed and launched on that device. The apps compile and target SDK 36 and support API 26+. For broader release qualification, also test on your chosen stable Android image and physical devices; the wrapper launch checks do not replace testing report, login and download workflows with real accounts.

## Build APKs

Double-click either executable at the repository root, or run it in a terminal:

```bat
build-android-local.cmd
build-android-production.cmd
```

Equivalent npm commands:

```sh
npm run android:build:local
npm run android:build:production
```

| Variant            | Package                      | Opens                                       | Artifact                                            |
| ------------------ | ---------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Local debug        | `com.tomatoes.reports.local` | `http://localhost:3004/#runs`               | `artifacts/android/tomatoes-local-debug.apk`        |
| Production release | `com.tomatoes.reports`       | `https://tomatoes-reports.vercel.app/#runs` | `artifacts/android/tomatoes-production-release.apk` |

The two apps can coexist. Local builds use Android's debug signing key. Production builds are release-signed and are not debuggable. Both scripts verify the signature, environment/package and target SDK, then write a SHA-256 sidecar. Build outputs are ignored by Git. No database migrations or production deployment are run by these scripts.

To change an endpoint or port:

```bat
build-android-local.cmd -ServerPort 3000
build-android-production.cmd -ProductionOrigin https://your-tomatoes.example.com
```

Production accepts only a clean HTTPS origin, without credentials, a path, query or fragment. The Android launcher always uses its configured origin and ignores arbitrary URLs passed in launch Intents.

## Run on the Pixel 10 Pro

Keep your local Tomatoes API running on the configured port. The local emulator script checks it before installation. It uses `adb reverse` so Android's `localhost:3004` reaches your computer's existing loopback server; no LAN binding or firewall change is needed.

```sh
npm run android:run:local
npm run android:run:production
```

These build, start or reuse the Pixel 10 Pro, install the matching APK, and launch it. Automated runs use a headless emulator. To see the interactive emulator window when starting the device:

```bat
build-android-local.cmd -Run -ShowEmulator
build-android-production.cmd -Run -ShowEmulator
```

If an existing headless AVD is running, stop it from Android Studio / Device Manager first, then use `-ShowEmulator`. The scripts reuse running devices and do not kill unrelated emulators. Emulator output is in `.tomatoes-data/android-emulator.*.log` and boot waits time out after five minutes. If Chrome displays its first-run setup, complete it yourself in the visible emulator. No browser agreements are accepted automatically.

To install an already-built APK without rebuilding:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android/emulator.ps1 -ApkPath artifacts/android/tomatoes-local-debug.apk -PackageId com.tomatoes.reports.local -LocalPort 3004 -ShowEmulator
```

The process-only execution-policy option allows the repository script to run; it does not change the machine's execution policy.

## Release signing and updates

For a new app with no existing certificate association, the first local production build generates a release key and random credentials in **`.tomatoes-data/android-signing/`** and restricts that directory to your Windows account and SYSTEM. The keystore is `tomatoes-release.p12`; `signing.json` contains its credentials. **Back up this entire directory securely before distributing the APK. Future updates need the same signing key. Never commit or share its private contents.** The script refuses to silently replace an existing keystore with missing credentials or create a new identity when the repository already has a release-certificate association. On another machine, restore the original signing directory or provide the same signing identity through environment variables before building production.

For CI or an existing signing identity, supply these environment variables through your private secret store:

```text
TOMATOES_ANDROID_KEYSTORE=<absolute path to release keystore>
TOMATOES_ANDROID_STORE_PASSWORD=<secret>
TOMATOES_ANDROID_KEY_ALIAS=tomatoes
TOMATOES_ANDROID_KEY_PASSWORD=<secret; defaults to store password>
TOMATOES_ANDROID_VERSION_CODE=1
TOMATOES_ANDROID_VERSION_NAME=1.0.0
```

CI never generates a new release identity automatically. Increment the positive integer version code for app updates. Passwords are passed to keytool/Gradle through process environment variables, not command-line literals. The build exports only the public release certificate (`artifacts/android/tomatoes-release.cer`).

## Full-screen production verification

Production builds generate **`public/.well-known/assetlinks.json`**, binding `com.tomatoes.reports` to the actual release certificate's SHA-256 fingerprint. The web build includes it at:

```text
https://YOUR_PRODUCTION_HOST/.well-known/assetlinks.json
```

Deploy that generated file with the website to enable verified full-screen behavior. Until the live origin serves the matching association, Chrome shows its normal Custom Tab toolbar. The APK still opens the site. Never disable Chrome's ownership verification to hide the toolbar. The local HTTP variant is intended to use the browser fallback.

If publishing through Google Play App Signing, add the **Play app-signing certificate** fingerprint to the association file as well; it may differ from your local/upload key. This task builds installable APKs, not a Play Store listing or an Android App Bundle. Android Studio can open the `android/` project for further native work.

## Authentication, imports and PDF reports

The browser owns cookies, file selection, downloads and Google sign-in. This avoids embedding Google login in an unsupported WebView. Existing same-origin sessions, CSRF checks, organization membership and project restrictions still apply. Google login still requires the Google Web client ID and authorized web origin described in [Google sign-in setup](google-sign-in.md); the Android wrapper does not supply or bypass that configuration.

Reports and PDFs use the existing mobile web UI. The local and production origins have separate browser storage and sessions. There is no native bridge exposing cookies, passwords or report files to Java code, and the launcher requests no broad storage, camera or contacts access.

References: [Trusted Web Activity overview](https://developer.chrome.com/docs/android/trusted-web-activity), [Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper).
