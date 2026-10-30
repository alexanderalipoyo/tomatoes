const { promisify } = require("node:util");
const { gzip, gunzip } = require("node:zlib");
const crypto = require("node:crypto");
const ReportData = require("../shared/report-data");
const compress = promisify(gzip);
const decompress = promisify(gunzip);
const CHUNK_BYTES = 1024 * 1024;
async function transfer(saved, limit) {
  const source = Buffer.from(saved.originalText);
  if (source.length > ReportData.MAX_REPORT_BYTES)
    throw Object.assign(new Error("Report exceeds the 50 MB limit."), {
      status: 413,
    });
  const base = {
    run: saved.record,
    totalBytes: source.length,
    sha256: crypto.createHash("sha256").update(source).digest("hex"),
  };
  const zipped = await compress(source, { level: 6 });
  const compressed = {
    ...base,
    encoding: "gzip-base64",
    data: zipped.toString("base64"),
  };
  if (Buffer.byteLength(JSON.stringify(compressed)) <= limit) return compressed;
  return { ...base, encoding: "chunked-base64", chunkBytes: CHUNK_BYTES };
}
async function unpack(body) {
  if (body?.reportEncoding === undefined) return body;
  if (
    body.reportEncoding !== "gzip-base64" ||
    typeof body.reportData !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      body.reportData,
    )
  )
    throw Object.assign(new Error("Invalid compressed report."), {
      status: 400,
    });
  try {
    const source = await decompress(Buffer.from(body.reportData, "base64"), {
      maxOutputLength: ReportData.MAX_REPORT_BYTES,
    });
    return { ...body, reportText: source.toString("utf8") };
  } catch {
    throw Object.assign(
      new Error("Compressed report is invalid or exceeds the 50 MB limit."),
      { status: 400 },
    );
  }
}
module.exports = { transfer, unpack, CHUNK_BYTES };
