import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverRuntimeConfig: {
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
  },
};

export default nextConfig;