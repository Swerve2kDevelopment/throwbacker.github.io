/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  experimental: {
    serverActions: {
      // Admin image uploads go through server actions. Vercel caps request
      // bodies at 4.5 MB, so there's no point allowing more than that.
      bodySizeLimit: "4.5mb"
    }
  }
};

export default nextConfig;
