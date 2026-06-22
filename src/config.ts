export interface Config {
  databaseUrl: string;
  webhookSecret: string;
  leaseSeconds: number;
  port: number;
  pollIntervalMs: number;
  gcIntervalMs: number;
  githubAppId: string;
  githubPrivateKey: string;
  githubInstallationId: number;
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl?: string;
  repoOwner: string;
  repoName: string;
  /** GitHub App slug used for @<slug> command mentions (e.g. @mbzdevflow[bot]). */
  githubAppSlug: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

function number(name: string, fallback: number): number {
  return process.env[name] ? Number(process.env[name]) : fallback;
}

/** Load configuration from the environment (see .env.example). */
export function loadConfig(): Config {
  return {
    databaseUrl: required('DATABASE_URL'),
    webhookSecret: required('GITHUB_WEBHOOK_SECRET'),
    leaseSeconds: number('DEVFLOW_LEASE_SECONDS', 1800),
    port: number('PORT', 3000),
    pollIntervalMs: number('DEVFLOW_POLL_MS', 1000),
    gcIntervalMs: number('DEVFLOW_GC_INTERVAL_MS', 3_600_000),
    githubAppId: required('GITHUB_APP_ID'),
    githubPrivateKey: required('GITHUB_PRIVATE_KEY'),
    githubInstallationId: Number(required('GITHUB_INSTALLATION_ID')),
    providerModel: required('DEVFLOW_PROVIDER_MODEL'),
    providerApiKey: required('DEVFLOW_PROVIDER_API_KEY'),
    providerBaseUrl: process.env.DEVFLOW_PROVIDER_BASE_URL || undefined,
    repoOwner: required('DEVFLOW_REPO_OWNER'),
    repoName: required('DEVFLOW_REPO_NAME'),
    githubAppSlug: process.env.DEVFLOW_GITHUB_APP_SLUG ?? 'mbzdevflow',
  };
}
