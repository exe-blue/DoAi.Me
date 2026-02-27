import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Validate required Auth0 environment variables
function validateAuth0Config(): void {
  const requiredVars = [
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_SECRET",
    "APP_BASE_URL",
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required Auth0 environment variables: ${missingVars.join(", ")}\n` +
        `Please set these variables in your .env.local file (for local development) or in your deployment environment (e.g., Vercel).\n` +
        `See docs/ENV.md for more information.\n` +
        `To generate AUTH0_SECRET, run: openssl rand -hex 32`
    );
  }

  // Validate APP_BASE_URL format
  try {
    new URL(process.env.APP_BASE_URL!);
  } catch (error) {
    throw new Error(
      `Invalid APP_BASE_URL: "${process.env.APP_BASE_URL}"\n` +
        `APP_BASE_URL must be a valid URL (e.g., http://localhost:3000 or https://doai.me)`
    );
  }
}

// Validate configuration before creating the Auth0 client
validateAuth0Config();

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email",
  },
  session: {
    rolling: true,
    absoluteDuration: 86400, // 24 hours
  },
});
