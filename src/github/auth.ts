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
