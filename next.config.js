/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true, // KEEP DISABLED: Essential for resolving ChunkLoadErrors in this environment
  register: false,
  skipWaiting: true,
});

const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    TZ: 'Asia/Manila',
  },
  reactStrictMode: false, // Helps with some hydration/chunk load edge cases in cloud dev environments
};

module.exports = withPWA(nextConfig);
