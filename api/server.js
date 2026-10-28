const { createApplication } = require("../src/server/app");
function createServerlessHandler(factory = () => createApplication()) {
  let application, ready;
  return async function handler(req, res) {
    try {
      application ||= factory();
      ready ||= application.store.ready().catch((error) => {
        ready = null;
        throw error;
      });
      await ready;
      const url = new URL(req.url, "http://localhost");
      const route = url.searchParams.get("__tomatoes_path");
      if (route) {
        if (!route.startsWith("/api/") && route !== "/results.json") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        url.pathname = route;
        url.searchParams.delete("__tomatoes_path");
        req.url = url.pathname + url.search;
      }
      await application.handler(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            error:
              "Tomatoes is unavailable. Check deployment settings and database migrations.",
          }),
        );
      } else if (!res.writableEnded) res.end();
    }
  };
}
module.exports = createServerlessHandler();
module.exports.createServerlessHandler = createServerlessHandler;
