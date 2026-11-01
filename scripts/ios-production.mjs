import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [action = "build", requestedDevice] = process.argv.slice(2);
const mode = process.env.TOMATOES_IOS_MODE === "local" ? "local" : "production";
const env = { ...process.env, TOMATOES_IOS_MODE: mode };
const cli = path.join(root, "node_modules/@capacitor/cli/bin/capacitor");
const output = path.join(root, "artifacts/ios", mode);
const app = path.join(output, "Build/Products/Release-iphonesimulator/App.app");
const bundle =
  mode === "local" ? "com.tomatoes.reports.local" : "com.tomatoes.reports";
function command(binary, args, capture = false) {
  const result = spawnSync(binary, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw new Error(`${binary}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(
      `${binary} failed (${result.status}). ${capture ? result.stderr : ""}`,
    );
  return result.stdout;
}
function cap(...args) {
  return command(process.execPath, [cli, ...args]);
}
function sync() {
  command(process.execPath, ["scripts/build.js"]);
  if (!existsSync(path.join(root, "ios/App/App.xcodeproj")))
    cap("add", "ios", "--packagemanager", "SPM");
  cap("sync", "ios");
}
function simulator() {
  const listed = JSON.parse(
    command(
      "xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      true,
    ),
  );
  const devices = Object.values(listed.devices)
    .flat()
    .filter((d) => d.isAvailable);
  const candidates = devices.filter((d) =>
    requestedDevice
      ? d.name === requestedDevice || d.udid === requestedDevice
      : d.name.startsWith("iPhone"),
  );
  const selected =
    candidates.find((d) => d.state === "Booted") || candidates[0];
  if (!selected)
    throw new Error(
      `Simulator ${requestedDevice || "iPhone"} is not installed. Available: ${devices.map((d) => d.name).join(", ")}. Add a device/runtime in Xcode.`,
    );
  return selected;
}
function xcodeArgs(destination) {
  return [
    "-project",
    "ios/App/App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-destination",
    destination,
    "-derivedDataPath",
    output,
    `PRODUCT_BUNDLE_IDENTIFIER=${bundle}`,
  ];
}
try {
  if (
    !["sync", "open", "build", "run", "launch", "archive", "export"].includes(
      action,
    )
  )
    throw new Error(`Unknown action: ${action}`);
  if (!existsSync(cli))
    throw new Error("Run npm ci to install the iOS dependencies first.");
  if (action === "sync") {
    sync();
  } else {
    if (process.platform !== "darwin")
      throw new Error(
        "iOS compilation and Simulator require macOS with Xcode 26+. On Windows, npm run ios:sync can prepare the project.",
      );
    command("xcodebuild", ["-version"]);
    if (action === "open") {
      sync();
      cap("open", "ios");
    } else if (action === "export") {
      if (mode !== "production")
        throw new Error("IPA export requires production mode.");
      const options = process.env.TOMATOES_IOS_EXPORT_OPTIONS;
      if (!options || !existsSync(options))
        throw new Error(
          "Set TOMATOES_IOS_EXPORT_OPTIONS to your Xcode ExportOptions.plist.",
        );
      const archive = path.join(output, "Tomatoes.xcarchive");
      if (!existsSync(archive))
        throw new Error("Run npm run ios:archive:prod first.");
      command("xcodebuild", [
        "-exportArchive",
        "-archivePath",
        archive,
        "-exportPath",
        path.join(output, "ipa"),
        "-exportOptionsPlist",
        path.resolve(options),
      ]);
    } else if (action === "archive") {
      if (mode !== "production")
        throw new Error("Signed archives require production mode.");
      const team = process.env.TOMATOES_IOS_TEAM_ID;
      if (!/^[A-Z0-9]{10}$/.test(team || ""))
        throw new Error(
          "Set TOMATOES_IOS_TEAM_ID to your Apple Developer team ID and configure signing in Xcode.",
        );
      sync();
      command("xcodebuild", [
        ...xcodeArgs("generic/platform=iOS"),
        "-archivePath",
        path.join(output, "Tomatoes.xcarchive"),
        `DEVELOPMENT_TEAM=${team}`,
        "archive",
      ]);
    } else {
      const device = simulator();
      if (mode === "local" && action !== "launch") {
        const origin =
          process.env.TOMATOES_IOS_LOCAL_ORIGIN || "http://localhost:3004";
        const response = await fetch(`${origin}/api/team/status`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.status >= 500)
          throw new Error("Local Tomatoes server is unavailable.");
      }
      if (action !== "launch") {
        sync();
        mkdirSync(output, { recursive: true });
        command("xcodebuild", [
          ...xcodeArgs(`platform=iOS Simulator,id=${device.udid}`),
          "CODE_SIGNING_ALLOWED=NO",
          "build",
        ]);
        if (!existsSync(app))
          throw new Error("Xcode did not produce the expected App.app.");
        writeFileSync(
          path.join(output, "build.json"),
          JSON.stringify(
            {
              mode,
              bundle,
              device: device.name,
              builtAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      }
      if (action === "run" || action === "launch") {
        if (!existsSync(app))
          throw new Error(
            `No ${mode} simulator app exists. Run its build command first.`,
          );
        if (device.state !== "Booted")
          command("xcrun", ["simctl", "boot", device.udid]);
        command("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
        const developerDir = command("xcode-select", ["-p"], true).trim();
        const simulatorApp = [
          path.join(developerDir, "Applications/Simulator.app"),
          path.join(developerDir, "../Applications/Simulator.app"),
          "/Applications/Simulator.app",
        ].find((candidate) => existsSync(candidate));
        if (simulatorApp) command("open", ["-a", simulatorApp]);
        else
          console.warn(
            "Simulator.app is missing; launching on the booted simulator without its window.",
          );
        command("xcrun", ["simctl", "install", device.udid, app]);
        command("xcrun", [
          "simctl",
          "launch",
          "--terminate-running-process",
          device.udid,
          bundle,
        ]);
      }
    }
  }
} catch (error) {
  console.error(`Tomatoes iOS: ${error.message}`);
  process.exitCode = 1;
}
