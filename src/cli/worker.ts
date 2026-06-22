import { Octokit } from 'octokit';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { claudeRunner, SKELETON_PROMPT } from '../execution/claude.js';
import { OctokitGitHub } from '../github/client.js';
import { getInstallationToken } from '../github/auth.js';
import { sweepOrphanBranches } from '../worker/orphan-gc.js';
import { executeStage } from '../worker/stage.js';
import { processOnce, type ClaimedJob } from '../worker/worker.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const appCreds = {
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
  installationId: config.githubInstallationId,
};
const repo = { owner: config.repoOwner, name: config.repoName };

// Real Stage execution wiring (D6–D9): token per Job, sandbox clone, Claude
// headless with the Provider Config on the env, progress comment. The
// runClaude dep is built by claudeRunner — shared with the smoke test — so the
// provider-config → env mapping lives in one place (issue #6 criterion 2).
const execute = (job: ClaimedJob) =>
  executeStage(job, {
    getToken: () => getInstallationToken(appCreds),
    ghFactory: (token) =>
      new OctokitGitHub(new Octokit({ auth: `token ${token}` })),
    cloneUrl: `https://github.com/${repo.owner}/${repo.name}`,
    runClaude: claudeRunner({
      prompt: SKELETON_PROMPT,
      providerModel: config.providerModel,
      providerApiKey: config.providerApiKey,
      providerBaseUrl: config.providerBaseUrl,
      timeoutMs: 600_000,
    }),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sweepOrphans(): Promise<void> {
  const token = await getInstallationToken(appCreds);
  const gh = new OctokitGitHub(new Octokit({ auth: `token ${token}` }));
  const deleted = await sweepOrphanBranches(gh, repo, { now: new Date() });
  if (deleted.length) console.log('[gc] deleted orphan branches:', deleted);
}

console.log('devflow worker started');
let lastSweep = Date.now();

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Reclaim-before-claim loop (ADR-0013/0018); orphan GC sweeps on a coarser timer.
// eslint-disable-next-line no-constant-condition
while (true) {
  try {
    const { ran } = await processOnce({
      pool,
      leaseSeconds: config.leaseSeconds,
      execute,
    });
    if (!ran) await sleep(config.pollIntervalMs);

    if (Date.now() - lastSweep > config.gcIntervalMs) {
      lastSweep = Date.now();
      await sweepOrphans();
    }
  } catch (err) {
    console.error('[worker] tick failed:', err);
    await sleep(config.pollIntervalMs);
  }
}
