import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones/tablets on the local network load the dev server's
  // JavaScript (Next blocks non-localhost origins by default). Covers the
  // common private network ranges; has no effect in production.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  experimental: {
    // Documents and message attachments may be up to 10 MB each
    // (lib/portal/files.ts); leave headroom for multipart overhead.
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
