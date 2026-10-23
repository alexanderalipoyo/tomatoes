#!/usr/bin/env node
const path = require("node:path");
const crypto = require("node:crypto");
const {
  readJSON,
  writeJSON,
  hashPassword,
  hashToken,
} = require("../server-team");
async function main() {
  const [command, subject, ...args] = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf("--" + name);
    return index < 0 ? null : args[index + 1];
  };
  const directory =
    process.env.TOMATOES_DATA_DIR ||
    path.join(__dirname, "..", ".tomatoes-data");
  if (command === "add-user") {
    const username = String(subject || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(username))
      throw new Error(
        "Provide a username using letters, numbers, dots, underscores, or hyphens.",
      );
    const role = option("role") || "editor";
    if (!["admin", "editor", "viewer"].includes(role))
      throw new Error("Role must be admin, editor, or viewer.");
    const projects = (
      option("projects") || (role === "admin" ? "*" : "tomatoes")
    )
      .split(",")
      .map((value) => value.trim());
    if (
      !projects.length ||
      projects.some(
        (value) =>
          value !== "*" && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(value),
      )
    )
      throw new Error("Provide valid project identifiers.");
    let password = process.env.TOMATOES_NEW_PASSWORD;
    if (!password) {
      if (!process.stdin.isTTY)
        throw new Error(
          "Use an interactive terminal or provide TOMATOES_NEW_PASSWORD.",
        );
      const { Writable } = require("node:stream");
      const readline = require("node:readline/promises");
      const output = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      output.isTTY = true;
      const terminal = readline.createInterface({
        input: process.stdin,
        output,
        terminal: true,
      });
      process.stdout.write("Password (12+ characters, input hidden): ");
      password = await terminal.question("");
      terminal.close();
      process.stdout.write("\n");
    }
    const file = path.join(directory, "users.json");
    const users = await readJSON(file, []);
    if (users.some((user) => user.username === username))
      throw new Error("This username already exists. Choose another username.");
    users.push({ username, role, projects, ...hashPassword(password) });
    await writeJSON(file, users);
    console.log(
      `Created ${role} account ${username} for ${projects.join(", ")}.`,
    );
  } else if (command === "create-ci-token") {
    const project = subject;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(project || ""))
      throw new Error("Provide a valid project identifier.");
    const token = crypto.randomBytes(32).toString("base64url");
    const file = path.join(directory, "tokens.json");
    const records = await readJSON(file, []);
    records.push({
      project,
      hash: hashToken(token),
      createdAt: new Date().toISOString(),
    });
    await writeJSON(file, records);
    console.log(token);
  } else
    throw new Error(
      "Usage: node tools/team-admin.js add-user USER --projects PROJECTS [--role editor|viewer|admin]\n       node tools/team-admin.js create-ci-token PROJECT",
    );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
