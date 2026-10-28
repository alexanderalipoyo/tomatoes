const http = require("node:http");
const { loadLocalEnvironment } = require("./config");
loadLocalEnvironment();
const { createApplication } = require("./app");
const { handler, store } = createApplication();
const server = http.createServer(handler);
async function start() {
  await store.ready();
  server.listen(process.env.PORT || 3000, "127.0.0.1", () =>
    console.log(
      `Dashboard available at http://localhost:${process.env.PORT || 3000} (${store.kind} storage)`,
    ),
  );
}
start().catch(async () => {
  console.error(
    "Unable to start Tomatoes storage. Check the environment and run the database migration.",
  );
  await store.close().catch(() => {});
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  });
