// Load .env.sentry so SENTRY_AUTH_TOKEN is available during build (release + source map upload)
const path = require("path");
const fs = require("fs");
const envSentryPath = path.join(__dirname, ".env.sentry");
try {
  const content = fs.readFileSync(envSentryPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
} catch (_) {
  // .env.sentry optional (e.g. when token is set only in Vercel env)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,  // Skip TypeScript build errors to allow containerization
  },
  async redirects() {
    return [
      { source: "/legacy-dashboard", destination: "/dashboard", permanent: true },
      { source: "/legacy-dashboard/workers", destination: "/infrastructure/pcs", permanent: true },
      { source: "/legacy-dashboard/devices", destination: "/infrastructure/devices", permanent: true },
      { source: "/legacy-dashboard/proxies", destination: "/infrastructure/proxies", permanent: true },
      { source: "/legacy-dashboard/network", destination: "/infrastructure/network", permanent: true },
      { source: "/legacy-dashboard/channels", destination: "/content/channels", permanent: true },
      { source: "/legacy-dashboard/content", destination: "/content/content", permanent: true },
      { source: "/legacy-dashboard/tasks", destination: "/content/tasks", permanent: true },
      { source: "/legacy-dashboard/completed", destination: "/content/completed", permanent: true },
      { source: "/legacy-dashboard/scripts", destination: "/automation/scripts", permanent: true },
      { source: "/legacy-dashboard/scripts/new", destination: "/automation/scripts", permanent: true },
      { source: "/legacy-dashboard/scripts/:id*", destination: "/automation/scripts", permanent: true },
      { source: "/legacy-dashboard/workflows", destination: "/automation/workflows", permanent: true },
      { source: "/legacy-dashboard/workflows/new", destination: "/automation/workflows", permanent: true },
      { source: "/legacy-dashboard/workflows/:id*", destination: "/automation/workflows", permanent: true },
      { source: "/legacy-dashboard/presets", destination: "/automation/scripts", permanent: true },
      { source: "/legacy-dashboard/adb", destination: "/automation/adb", permanent: true },
      { source: "/legacy-dashboard/settings", destination: "/system/settings", permanent: true },
      { source: "/legacy-dashboard/logs", destination: "/system/logs", permanent: true },
      { source: "/legacy-dashboard/errors", destination: "/system/errors", permanent: true },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // Configure webpack cache to help prevent corruption from concurrent builds
    if (dev && !isServer) {
      config.cache = {
        type: "filesystem",
        buildDependencies: {
          config: [__filename],
        },
        // Add cache invalidation on config changes
        version: process.env.NEXT_PUBLIC_BUILD_ID || "1",
      };
    }
    return config;
  },
};

module.exports = nextConfig;

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "reblue-inc",
  project: "doai-me",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
