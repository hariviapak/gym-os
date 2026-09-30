import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // hide the dev-mode floating indicator — its portal overlay covers the
  // bottom-right corner (right where the mobile More nav button sits)
  devIndicators: false,
};

export default nextConfig;
