/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    useTypeScriptCli: true,
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
