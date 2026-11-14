/** @type {import('next').NextConfig} */
const nextConfig = {
  // embedded Postgres for local development (not used on Vercel)
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    // payment slips are uploaded through server actions (Vercel itself caps bodies at ~4.5 MB)
    serverActions: { bodySizeLimit: '5mb' },
  },
};
export default nextConfig;
