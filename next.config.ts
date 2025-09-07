import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverRuntimeConfig: {
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  }
};

export default nextConfig;