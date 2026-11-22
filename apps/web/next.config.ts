import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@alliance-hcm/shared'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
