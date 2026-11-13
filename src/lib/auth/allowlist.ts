/** Whether a GitHub login may sign in. The allowlist is already lowercased by `parseEnv`. */
export function isAllowed(login: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(login.toLowerCase());
}
