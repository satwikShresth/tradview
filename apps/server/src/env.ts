import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Server Configuration
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().default(8080),

    // CORS Configuration
    CORS_ORIGIN: z.string().default("http://localhost:3000"),

    // JWT Configuration
    JWT_SECRET: z.string().default("super-secret-jwt-key"),
    JWT_EXPIRES_IN: z.string().default("24h"),

    // Scraper Configuration
    SCRAPER_TIMEOUT: z.coerce.number().default(10000),
    SCRAPER_RETRIES: z.coerce.number().default(3),
    SCRAPER_RETRY_DELAY: z.coerce.number().default(500),
  },

  /**
   * What object holds the environment variables at runtime.
   */
  runtimeEnv: process.env,

  /**
   * Treat empty strings as undefined.
   */
  emptyStringAsUndefined: true,
});

// Export config for backwards compatibility
export const config = {
  server: {
    host: env.HOST,
    port: env.PORT,
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] as string[],
      allowedHeaders: ["Content-Type", "Authorization"] as string[],
      credentials: true,
    },
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "tradview-server",
  },
  scraper: {
    timeout: env.SCRAPER_TIMEOUT,
    retries: env.SCRAPER_RETRIES,
    retryDelay: env.SCRAPER_RETRY_DELAY,
  },
} as const;
