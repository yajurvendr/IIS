/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    turbo: {
      root: __dirname,
    },
  },
};

module.exports = nextConfig;
