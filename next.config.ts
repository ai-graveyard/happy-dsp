import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ffmpeg-static uses `__dirname` to locate its binary, which Turbopack inlines
  // as the literal "/ROOT/..." placeholder at build time. Keep it external so
  // Node's runtime require resolves the real path.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
