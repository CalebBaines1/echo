import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev badge sits over the bottom buttons on phone-sized screens.
  devIndicators: false,
};

export default nextConfig;
