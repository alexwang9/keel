import "server-only";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

// GitHub login rules: alphanumeric or single hyphens, no leading/trailing hyphen, max 39 chars.
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const required = z
  .string({ error: "is required" })
  .trim()
  .min(1, { error: "is required", abort: true });

const loginList = required
  .transform((value) =>
    value
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter((login) => login.length > 0),
  )
  .pipe(
    z
      .array(z.string().regex(GITHUB_LOGIN, "contains an invalid GitHub login"))
      .min(1, "must list at least one GitHub login"),
  );

const flag = z
  .enum(["0", "1"], { error: 'must be "0" or "1"' })
  .optional()
  .transform((value) => value === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({ error: "must be an absolute URL" }),
    ANTHROPIC_API_KEY: required,
    GITHUB_CLIENT_ID: required,
    GITHUB_CLIENT_SECRET: required,
    SESSION_SECRET: required.min(32, "must be at least 32 characters"),
    ALLOWED_GITHUB_LOGINS: loginList,
    KEEL_FAKE_EXTERNALS: flag,
  })
  .refine((env) => !(env.NODE_ENV === "production" && env.KEEL_FAKE_EXTERNALS), {
    path: ["KEEL_FAKE_EXTERNALS"],
    message: "must not be enabled in production",
  });

export type Env = z.infer<typeof envSchema>;

type RawEnv = Record<string, string | undefined>;

/** Parses raw env vars. Errors name the variable and the rule, never the value. */
export function parseEnv(raw: RawEnv): Result<Env, string[]> {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`));
}

let cached: Env | undefined;

/** Validated env for server code. Throws on misconfiguration so the server fails fast at startup. */
export function getEnv(): Env {
  if (cached) return cached;
  const result = parseEnv(process.env);
  if (!result.ok) {
    throw new Error(`Invalid environment configuration:\n- ${result.error.join("\n- ")}`);
  }
  cached = result.value;
  return cached;
}
