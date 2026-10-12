/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output as static HTML for Electron packaging
  output: 'export',

  // Allow Electron to serve Next.js pages
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : undefined,

  // Disable image optimization for Electron (uses file:// protocol in prod)
  images: {
    unoptimized: true,
  },

  // Ignore ESLint errors during build for MVP
  eslint: {
    ignoreDuringBuilds: true,
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
