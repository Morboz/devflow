import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

export type AppCreds = {
  appId: string;
  privateKey: string;
  installationId: number;
};

/**
 * Mint a raw installation token string (D7). Used where a bearer token is
 * needed directly — e.g. embedding in the git clone URL (D6). Short-lived
 * (~1h); mint one per Job and discard it (ADR-0008).
 */
export async function getInstallationToken(creds: AppCreds): Promise<string> {
  const auth = createAppAuth({
    appId: creds.appId,
    privateKey: creds.privateKey,
  });
  const { token } = await auth({
    type: 'installation',
    installationId: creds.installationId,
  });
  return token;
}

/**
 * Mint an installation-authenticated Octokit (D7). The installation token is
 * short-lived (~1h), created lazily and cached only for this instance's
 * lifetime — so construct one per Job and drop it when the Job ends
 * (ADR-0008). Never cached long-term, never logged, never written to disk.
 */
export function createInstallationOctokit(creds: AppCreds): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      type: 'installation',
      appId: creds.appId,
      privateKey: creds.privateKey,
      installationId: creds.installationId,
    },
  });
}

/**
 * The exact permission set the App must hold (ADR-0008): Contents + Issues +
 * Pull requests (write) and Metadata (read). Nothing more — no CI/Workflows,
 * Admin, or Organization. The installation token inherits these (GitHub does
 * not allow per-scope token narrowing), so this is also exactly what every
 * per-Job token grants.
 */
export const REQUIRED_APP_PERMISSIONS: Readonly<Record<string, string>> = {
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  metadata: 'read',
};

/**
 * The exact webhook events the App must subscribe to (issue #4 / PRD D1):
 * issues, issue_comment, pull_request.
 */
export const REQUIRED_APP_EVENTS = ['issues', 'issue_comment', 'pull_request'] as const;

/** A fetched installation's granted permissions + subscribed events. */
export type InstallationGrant = {
  permissions: Record<string, string>;
  events: string[];
};

export type GrantCheck = {
  ok: boolean;
  /** Human-readable mismatches; empty when ok. */
  problems: string[];
};

/**
 * Verify a fetched installation grant matches ADR-0008 exactly: the four
 * permissions at the right level, no extras, and all three events subscribed.
 * Pure (no network) so the smoke test (S2) can assert App registration without
 * clicking GitHub settings.
 */
export function checkInstallationGrant(grant: InstallationGrant): GrantCheck {
  const problems: string[] = [];
  const perms = grant.permissions ?? {};

  for (const [key, level] of Object.entries(REQUIRED_APP_PERMISSIONS)) {
    if (perms[key] !== level) {
      problems.push(
        `permission '${key}' must be '${level}' but is '${perms[key] ?? 'missing'}'`,
      );
    }
  }
  for (const key of Object.keys(perms)) {
    if (!(key in REQUIRED_APP_PERMISSIONS)) {
      problems.push(
        `unexpected permission '${key}' (=${perms[key]}) — ADR-0008 allows only the four`,
      );
    }
  }
  for (const event of REQUIRED_APP_EVENTS) {
    if (!grant.events.includes(event)) {
      problems.push(`missing event subscription '${event}'`);
    }
  }

  return { ok: problems.length === 0, problems };
}
