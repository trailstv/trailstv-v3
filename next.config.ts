import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Flat files in /content are read at build time and bundled into server functions.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.nps.gov" }],
  },
};

export default nextConfig;
