import http from 'node:http';
import { Webhooks } from '@octokit/webhooks';
import { adaptEvent } from './adapter.js';
import { handleEvent, type HandlerDeps } from './handler.js';

/**
 * Build the webhook HTTP server. We use the Webhooks instance only for its
 * timing-safe `verify`; on a valid signature we adapt + run the fast-path
 * directly (parse → enqueue/help, ADR-0002). D2 requires 401 on signature
 * mismatch, which we control ourselves (createNodeMiddleware returns 400).
 */
export function createWebhookServer(
  secret: string,
  deps: HandlerDeps,
  path = '/webhook',
): http.Server {
  const webhooks = new Webhooks({ secret });

  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== path) {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');

    const signature = req.headers['x-hub-signature-256'];
    if (typeof signature !== 'string' || !(await webhooks.verify(body, signature))) {
      res.writeHead(401).end('signature does not match');
      return;
    }

    const name = req.headers['x-github-event'];
    if (typeof name !== 'string') {
      res.writeHead(400).end('missing x-github-event');
      return;
    }

    try {
      const event = adaptEvent(name, JSON.parse(body));
      if (event) await handleEvent(event, deps);
      res.writeHead(200).end('ok');
    } catch {
      res.writeHead(500).end('handler error');
    }
  });
}
