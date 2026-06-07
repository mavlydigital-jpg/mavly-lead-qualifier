/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["postgres", "drizzle-orm"],
  // The shared workspace folder structure means our schema/server code lives
  // outside `app/`. This silences Next's "outside of pages directory" warning.
  outputFileTracingIncludes: {
    "/api/trpc/**": ["./server/**/*", "./drizzle/**/*", "./shared/**/*"],
  },
};

export default nextConfig;
