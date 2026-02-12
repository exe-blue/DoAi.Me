/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev, isServer }) => {
    // Configure webpack cache to help prevent corruption from concurrent builds
    if (dev && !isServer) {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
        // Add cache invalidation on config changes
        version: process.env.NEXT_PUBLIC_BUILD_ID || '1',
      };
    }
    return config;
  },
};

module.exports = nextConfig;
