import type {NextConfig} from 'next';
const withPWA = require('next-pwa')({
    dest: 'public'
})

const nextConfig: NextConfig = {
  /* config options here */
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
  }
};

export default withPWA(nextConfig);
