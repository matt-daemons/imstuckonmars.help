import type { R2Bucket, Request as WorkerRequest } from "@cloudflare/workers-types";

// Local Wrangler bridge only. Never deploy: it deliberately has no public write auth.
export default {
  async fetch(request: WorkerRequest, env: { MAP_BUCKET: R2Bucket }): Promise<Response> {
    const key = new URL(request.url).pathname.slice(1);
    if (
      request.method !== "PUT" ||
      !/^(mars-v2|viking-native-v1|sites-v1|sites-v2)\/[a-zA-Z0-9_./-]+$/.test(key) ||
      key.includes("..")
    ) {
      return new Response("Not allowed", { status: 405 });
    }
    const length = Number(request.headers.get("Content-Length"));
    if (!Number.isSafeInteger(length) || length <= 0 || length > 40_000_000) {
      return new Response("Invalid object size", { status: 413 });
    }
    await env.MAP_BUCKET.put(key, request.body, {
      httpMetadata: {
        contentType: request.headers.get("Content-Type") ?? "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    return new Response(null, { status: 201 });
  },
};
