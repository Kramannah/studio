/** @type {import('next').NextConfig} */
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

module.exports = nextConfig;
