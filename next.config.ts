import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/dashboard", destination: "/terminal", permanent: true },
      { source: "/stock", destination: "/research", permanent: true },
      { source: "/stock/:symbol", destination: "/terminal/:symbol", permanent: true },
      { source: "/securities", destination: "/markets/stocks", permanent: true },
    ];
  },
};

export default nextConfig;
