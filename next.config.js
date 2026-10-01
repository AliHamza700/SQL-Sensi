/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output as standalone for Electron packaging
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,

  // Allow Electron to serve Next.js pages
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : undefined,

  // Disable image optimization for Electron (uses file:// protocol in prod)
  images: {
    unoptimized: true,
  },

  // Transpile packages if needed
  transpilePackages: [],

  webpack: (config, { isServer }) => {
    // Avoid bundling native modules for the renderer
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
