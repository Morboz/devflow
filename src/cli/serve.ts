import { Octokit } from 'octokit';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import type { CommentRef } from '../domain/types.js';
import { OctokitGitHub } from '../github/client.js';
import { getInstallationToken } from '../github/auth.js';
import { createWebhookServer } from '../webhook/server.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const appCreds = {
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
  installationId: config.githubInstallationId,
};

// Help-reply delivery (ADR-0019): post inline via an installation token. Only
// the bare-@devflow help reply uses this; Stage work runs in the worker.
const postComment = async (ref: CommentRef, body: string): Promise<void> => {
  const token = await getInstallationToken(appCreds);
  const gh = new OctokitGitHub(new Octokit({ auth: `token ${token}` }));
  await gh.createIssueComment(ref.repo.owner, ref.repo.name, ref.issueNumber, body);
};

const server = createWebhookServer(config.webhookSecret, { pool, postComment });
server.listen(config.port, () => {
  console.log(`devflow webhook server listening on :${config.port}/webhook`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
