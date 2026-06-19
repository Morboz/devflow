import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import type { CommentRef } from '../domain/types.js';
import { createWebhookServer } from '../webhook/server.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

// Phase 0 stub: real GitHub comment posting arrives with D7 (installation
// token) and D9 (progress comment). The fast-path works without it; only the
// bare-@devflow help reply is affected, and even then only its delivery.
const postComment = async (_ref: CommentRef, body: string): Promise<void> => {
  console.warn('[serve] postComment stub — would post:', body.split('\n')[0]);
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
