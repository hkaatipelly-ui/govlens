/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep development and production builds from sharing one mutable output
  // directory, which can make dev-server chunk references stale after a build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
