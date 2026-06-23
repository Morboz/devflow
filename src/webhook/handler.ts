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

/**
 * Reply posted when a Trigger is rejected by Active Stage Run Exclusivity
 * (ADR-0010 rule 2): a second trigger for a (feature, stage) already
 * non-terminal is refused with this message. Posted inline like the help
 * reply — a fast, synchronous, non-stage confirmation (ADR-0019).
 */
export const stageInProgressText = (stage: string): string =>
  `⏳ \`${stage}\` is already in progress for this issue — I'll skip this request. Re-trigger once the current run finishes.`;

export type HandlerDeps = {
  pool: Pool;
  /** Post a comment on an issue/PR (the GitHub boundary). */
  postComment: (ref: CommentRef, body: string) => Promise<void>;
  /** GitHub App slug for @<slug> command mentions. Defaults to 'mbzdevflow'. */
  botSlug?: string;
};

export type HandlerResult = { status: number };

/**
 * Dispatch a verified, adapted webhook event. The handler does only fast work:
 * parse → (ignore | post help inline | enqueue). No LLM/clone work runs here
 * (ADR-0002); the only inline replies are fast, synchronous, non-stage
 * confirmations — the help text and the exclusivity-rejection notice
 * (ADR-0019).
 */
export async function handleEvent(
  event: WebhookEvent,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const result = parse(event, deps.botSlug);
  switch (result.kind) {
    case 'ignore':
      return { status: 200 };
    case 'help':
      await deps.postComment(result.replyTo, HELP_TEXT);
      return { status: 200 };
    case 'trigger': {
      const enq = await enqueue(deps.pool, result.trigger);
      // A duplicate trigger_key (webhook replay) is a silent no-op (ADR-0004).
      // A rejection by exclusivity is communicated to the user inline: there is
      // no Job to surface it through, so the comment is the whole feedback
      // (ADR-0010 rule 2). 'enqueued' needs no reply.
      if (enq.outcome === 'rejected') {
        await deps.postComment(
          {
            repo: result.trigger.target.repo,
            issueNumber: result.trigger.target.number,
          },
          stageInProgressText(result.trigger.stage),
        );
      }
      return { status: 200 };
    }
  }
}
