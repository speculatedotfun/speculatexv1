/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rainbow-me/rainbowkit', '@wagmi/core'],
  images: {
    domains: ['your-domain.com'], // Replace with your actual domain
    unoptimized: false, // Enable Next.js image optimization
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
    };

    return config;
  },
};

module.exports = nextConfig;
