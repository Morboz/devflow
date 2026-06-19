export interface Config {
  databaseUrl: string;
  webhookSecret: string;
  leaseSeconds: number;
  port: number;
  pollIntervalMs: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

/** Load configuration from the environment (see .env.example). */
export function loadConfig(): Config {
  return {
    databaseUrl: required('DATABASE_URL'),
    webhookSecret: required('GITHUB_WEBHOOK_SECRET'),
    leaseSeconds: Number(process.env.DEVFLOW_LEASE_SECONDS ?? '1800'),
    port: Number(process.env.PORT ?? '3000'),
    pollIntervalMs: Number(process.env.DEVFLOW_POLL_MS ?? '1000'),
  };
}
