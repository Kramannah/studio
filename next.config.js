/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true, // KEEP DISABLED: Essential for resolving ChunkLoadErrors during build/deploy
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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    TZ: 'Asia/Manila',
  },
};

module.exports = withPWA(nextConfig);
