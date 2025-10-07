import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_API_BASE_URL: z.url().default("http://localhost:8080"),
    NEXT_PUBLIC_CONNECTRPC_BASE_URL: z.url().default("http://localhost:8080"),
    NEXT_PUBLIC_COOKIE_DOMAIN: z.string().default("localhost"),
    NEXT_PUBLIC_COOKIE_SECURE: z.coerce.boolean().default(false),
    NEXT_PUBLIC_SESSION_COOKIE_NAME: z
      .string()
      .default("tradview-session-token"),
    NEXT_PUBLIC_SESSION_EXPIRES_DAYS: z.coerce.number().default(30),
    NEXT_PUBLIC_DEBUG_MODE: z.coerce.boolean().default(true),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_CONNECTRPC_BASE_URL:
      process.env.NEXT_PUBLIC_CONNECTRPC_BASE_URL,
    NEXT_PUBLIC_COOKIE_DOMAIN: process.env.NEXT_PUBLIC_COOKIE_DOMAIN,
    NEXT_PUBLIC_COOKIE_SECURE: process.env.NEXT_PUBLIC_COOKIE_SECURE,
    NEXT_PUBLIC_SESSION_COOKIE_NAME:
      process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
    NEXT_PUBLIC_SESSION_EXPIRES_DAYS:
      process.env.NEXT_PUBLIC_SESSION_EXPIRES_DAYS,
    NEXT_PUBLIC_DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
