import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  serverRuntimeConfig: {
    ALPACA_API_KEY_ID: process.env.ALPACA_API_KEY_ID,
    ALPACA_API_SECRET_KEY: process.env.ALPACA_API_SECRET_KEY,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Pin the Turbopack root to this project to ensure env files are loaded
  // from the correct directory when multiple lockfiles exist on the machine.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
