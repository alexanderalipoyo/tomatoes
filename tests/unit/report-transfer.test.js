const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { gzipSync } = require("node:zlib");
const Server = require("../../src/server/report-transfer");
const Client = require("../../src/shared/report-transfer-client");
const id = "a".repeat(64);
const route = "/api/runs/" + id;
function saved(text) {
  return { record: { id, metadata: { project: "web" } }, originalText: text };
}
function chunkRequest(source, manifest, mutate = (value) => value) {
  const bytes = Buffer.from(source.originalText);
  return async (path) => {
    if (!path.includes("?")) return manifest;
    const offset = Number(
      new URL("http://localhost" + path).searchParams.get("offset"),
    );
    return mutate({
      offset,
      totalBytes: bytes.length,
      data: bytes
        .subarray(offset, offset + Server.CHUNK_BYTES)
        .toString("base64"),
    });
  };
}
test("compressed transfers preserve exact original JSON including BOM and Unicode", async () => {
  const source = saved(
    "\uFEFF" +
      JSON.stringify({ code: "example".repeat(800000), label: "🍅 中文" }),
  );
  const manifest = await Server.transfer(source, 4 * 1024 * 1024);
  assert.equal(manifest.encoding, "gzip-base64");
  assert.ok(Buffer.byteLength(JSON.stringify(manifest)) < 100000);
  const result = await Client.download(route, async () => manifest);
  assert.equal(result.originalText, source.originalText);
});
test("bounded chunks reconstruct Unicode split across byte boundaries and detect corruption", async () => {
  const source = saved(
    "x".repeat(Server.CHUNK_BYTES - 1) + "🍅" + "z".repeat(200000),
  );
  const manifest = await Server.transfer(source, 1);
  assert.equal(manifest.encoding, "chunked-base64");
  const progress = [];
  const loaded = await Client.download(
    route,
    chunkRequest(source, manifest),
    (done, total) => progress.push([done, total]),
  );
  assert.equal(loaded.originalText, source.originalText);
  assert.equal(progress.at(-1)[0], Buffer.byteLength(source.originalText));
  await assert.rejects(
    Client.download(
      route,
      chunkRequest(source, manifest, (part) => ({
        ...part,
        totalBytes: part.totalBytes + 1,
      })),
    ),
    /changed/,
  );
  await assert.rejects(
    Client.download(
      route,
      chunkRequest(source, { ...manifest, sha256: "f".repeat(64) }),
    ),
    /changed/,
  );
});
test("large upload compression preserves metadata and original report text", async () => {
  const body = {
    reportText: JSON.stringify({ code: "x".repeat(6000000) }),
    name: "report.json",
    metadata: { project: "web", branch: "main" },
  };
  const packed = await Client.packUpload(JSON.stringify(body), 4 * 1024 * 1024);
  assert.ok(Buffer.byteLength(packed) < 100000);
  const decoded = await Server.unpack(JSON.parse(packed));
  assert.equal(decoded.reportText, body.reportText);
  assert.deepEqual(decoded.metadata, body.metadata);
  await assert.rejects(
    Server.unpack({ reportEncoding: "other", reportData: "invalid" }),
    /Invalid/,
  );
  await assert.rejects(
    Server.unpack({
      reportEncoding: "gzip-base64",
      reportData: Buffer.from("broken").toString("base64"),
    }),
    /invalid/,
  );
});
test("compressed upload expansion is capped at the report limit", async () => {
  const data = gzipSync(Buffer.alloc(50 * 1024 * 1024 + 1)).toString("base64");
  await assert.rejects(
    Server.unpack({ reportEncoding: "gzip-base64", reportData: data }),
    /50 MB/,
  );
});
test("download rejects invalid manifests and incomplete or oversized sources", async () => {
  await assert.rejects(
    Client.download(route, async () => ({ totalBytes: 51 * 1024 * 1024 })),
    /Invalid/,
  );
  const source = saved("x".repeat(200));
  const manifest = await Server.transfer(source, 4 * 1024 * 1024);
  await assert.rejects(
    Client.download(route, async () => ({ ...manifest, totalBytes: 201 })),
    /incomplete/,
  );
});

test("team requests use source transfers and compress uploads before enforcing the hosted cap", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const source = saved(JSON.stringify({ code: "test" }));
  const manifest = await Server.transfer(source, 4 * 1024 * 1024);
  const requests = [];
  const context = {
    ReportTransferClient: Client,
    TextEncoder,
    authStatus: { maxRequestBytes: 4 * 1024 * 1024 },
    fetch: async (route, options) => {
      requests.push({ route, options });
      return {
        ok: true,
        status: 200,
        json: async () =>
          route.endsWith("/source") ? manifest : { run: { id } },
      };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../../src/client/team.js"), "utf8"),
    context,
  );
  let progress = 0;
  const result = await context.teamRequest(route, {
    onDownloadProgress: () => progress++,
  });
  assert.equal(result.originalText, source.originalText);
  assert.equal(requests[0].route, route + "/source");
  assert.equal(requests[0].options.credentials, "same-origin");
  assert.equal(requests[0].options.onDownloadProgress, undefined);
  assert.ok(progress > 0);
  const reportText = JSON.stringify({ code: "x".repeat(6000000) });
  await context.teamRequest("/api/runs", {
    method: "POST",
    body: JSON.stringify({ reportText, metadata: { project: "web" } }),
  });
  const uploaded = requests.at(-1).options.body;
  assert.ok(Buffer.byteLength(uploaded) < 4 * 1024 * 1024);
  assert.equal(
    (await Server.unpack(JSON.parse(uploaded))).reportText,
    reportText,
  );
});

test("browsers without gzip decompression fall back to authorized chunks", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const source = saved("unicode 🍅");
  const manifest = await Server.transfer(source, 4 * 1024 * 1024);
  const context = {
    atob,
    btoa,
    Uint8Array,
    crypto: crypto.webcrypto,
    TextDecoder,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/shared/report-transfer-client.js"),
      "utf8",
    ),
    context,
  );
  let requests = 0;
  const request = chunkRequest(source, manifest);
  const loaded = await context.ReportTransferClient.download(
    route,
    async (path) => {
      requests++;
      return request(path);
    },
  );
  assert.equal(requests, 2);
  assert.equal(loaded.originalText, source.originalText);
});
