import type { Pool } from 'pg';
import type { CommentRef, WebhookEvent } from '../domain/types.js';
import { enqueue } from '../queue/enqueue.js';
import { parse } from './parser.js';

/** Command list shown on a bare `@devflow` mention (ADR-0001). */
export const HELP_TEXT = `devflow understands these commands:

- \`/refine\`      — turn a rough request into a PRD
- \`/decompose\`   — split a PRD into sub-issues
- \`/implement\`   — implement a sub-issue and open a PR
- \`/review\`      — review a pull request

Or add the \`devflow\` label to a new issue to start refinement.`;

export type HandlerDeps = {
  pool: Pool;
  /** Post a comment on an issue/PR (the GitHub boundary). */
  postComment: (ref: CommentRef, body: string) => Promise<void>;
};

export type HandlerResult = { status: number };

/**
 * Dispatch a verified, adapted webhook event. The handler does only fast work:
 * parse → (ignore | post help inline | enqueue). No LLM/clone work runs here
 * (ADR-0002); the help reply is the one narrow inline exception (ADR-0019).
 */
export async function handleEvent(
  event: WebhookEvent,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const result = parse(event);
  switch (result.kind) {
    case 'ignore':
      return { status: 200 };
    case 'help':
      await deps.postComment(result.replyTo, HELP_TEXT);
      return { status: 200 };
    case 'trigger':
      await enqueue(deps.pool, result.trigger);
      return { status: 200 };
  }
}
