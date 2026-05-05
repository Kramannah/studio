/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true, // KEEP DISABLED: Resolves ChunkLoadErrors during build and deploy
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  output: 'standalone', // MANDATORY for Firebase App Hosting
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true, // Recommended for standalone mode in serverless environments
  },
  env: {
    TZ: 'Asia/Manila',
  },
};

module.exports = withPWA(nextConfig);
