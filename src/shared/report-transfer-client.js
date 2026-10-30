(function (root) {
  const MAX_BYTES = 50 * 1024 * 1024;
  function decode(value) {
    if (typeof value !== "string" || value.length > 72 * 1024 * 1024)
      throw new Error("Invalid report transfer data.");
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  function encode(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  async function collect(stream, limit) {
    const reader = stream.getReader();
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit)
          throw new Error("Report transfer exceeds the allowed size.");
        parts.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }
  async function download(route, request, onProgress = () => {}) {
    const sourceRoute = route + "/source";
    const manifest = await request(sourceRoute);
    if (
      !Number.isSafeInteger(manifest.totalBytes) ||
      manifest.totalBytes <= 0 ||
      manifest.totalBytes > MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !manifest.run ||
      route !== "/api/runs/" + manifest.run.id
    )
      throw new Error("Invalid report download details.");
    let bytes;
    if (
      manifest.encoding === "gzip-base64" &&
      typeof DecompressionStream !== "undefined"
    ) {
      bytes = await collect(
        new Blob([decode(manifest.data)])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
        manifest.totalBytes,
      );
    } else {
      if (!["gzip-base64", "chunked-base64"].includes(manifest.encoding))
        throw new Error("Unsupported report transfer encoding.");
      // Also supports browsers without native gzip decompression.
      const chunkBytes = manifest.chunkBytes || 1024 * 1024;
      if (chunkBytes !== 1024 * 1024)
        throw new Error("Invalid report chunk size.");
      bytes = new Uint8Array(manifest.totalBytes);
      for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
        const part = await request(sourceRoute + "?offset=" + offset);
        const chunk = decode(part.data);
        if (
          part.offset !== offset ||
          part.totalBytes !== bytes.length ||
          chunk.length !== Math.min(chunkBytes, bytes.length - offset)
        )
          throw new Error("Report changed during download. Open it again.");
        bytes.set(chunk, offset);
        onProgress(offset + chunk.length, bytes.length);
      }
    }
    if (bytes.length !== manifest.totalBytes)
      throw new Error("Report download is incomplete.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== manifest.sha256)
      throw new Error("Report changed during download. Open it again.");
    onProgress(bytes.length, bytes.length);
    return {
      run: manifest.run,
      originalText: new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes),
    };
  }
  async function packUpload(body, limit) {
    if (typeof CompressionStream === "undefined") return body;
    const parsed = JSON.parse(body);
    if (typeof parsed.reportText !== "string") return body;
    const bytes = new TextEncoder().encode(parsed.reportText);
    if (bytes.length > MAX_BYTES)
      throw new Error("Report exceeds the 50 MB limit.");
    const compressed = await collect(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
      MAX_BYTES + 65536,
    );
    const { reportText, ...metadata } = parsed;
    const packed = JSON.stringify({
      ...metadata,
      reportEncoding: "gzip-base64",
      reportData: encode(compressed),
    });
    return packed.length < body.length ? packed : body;
  }
  const api = { download, packUpload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportTransferClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
