import { Octokit } from 'octokit';
import {
  checkInstallationGrant,
  getInstallationToken,
  type InstallationGrant,
} from '../github/auth.js';

/**
 * S2 smoke test (issue #4): mint a real installation token from the GitHub App
 * credentials, make one authenticated call as the App, and verify the App is
 * registered with exactly the four ADR-0008 permissions and the three required
 * events — without clicking GitHub settings.
 *
 * Reads only the GitHub App + repo env vars (not the full Config, so it can run
 * before the provider/DB is configured). Run with: `pnpm smoke:auth`. Exits 0
 * on PASS, 1 on any failure. The token is never printed.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const appCreds = {
  appId: required('GITHUB_APP_ID'),
  privateKey: required('GITHUB_PRIVATE_KEY'),
  installationId: Number(required('GITHUB_INSTALLATION_ID')),
};
const repo = {
  owner: required('DEVFLOW_REPO_OWNER'),
  name: required('DEVFLOW_REPO_NAME'),
};

console.log(
  `smoke: minting installation token for app ${appCreds.appId} on ${repo.owner}/${repo.name}…`,
);
const token = await getInstallationToken(appCreds);
console.log('smoke: installation token minted (value not printed).');

// The single authenticated call as the App (issue #4, criterion 6). Returns the
// installation object, whose `permissions` + `events` describe exactly what the
// App (and thus every per-Job token) can do.
const octokit = new Octokit({ auth: `token ${token}` });
const { data } = await octokit.request(
  'GET /repos/{owner}/{repo}/installation',
  { owner: repo.owner, repo: repo.name },
);
const installation = data as {
  id?: number;
  permissions?: Record<string, string>;
  events?: string[];
};

const grant: InstallationGrant = {
  permissions: installation.permissions ?? {},
  events: installation.events ?? [],
};
const check = checkInstallationGrant(grant);

console.log(`smoke: installation id = ${installation.id ?? '?'}`);
console.log(`smoke: permissions     = ${JSON.stringify(grant.permissions)}`);
console.log(`smoke: events          = ${JSON.stringify(grant.events)}`);

if (!check.ok) {
  console.error('smoke: FAIL — grant does not match ADR-0008:');
  for (const problem of check.problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  'smoke: PASS — token authenticates as the App and the grant matches ADR-0008 (4 permissions, 3 events).',
);
