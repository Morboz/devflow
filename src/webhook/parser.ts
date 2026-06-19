import type { ParseResult, Stage, WebhookEvent } from '../domain/types.js';

// Slash command name -> Stage. Command name is the Stage's surface form (ADR-0001).
const COMMAND_TO_STAGE: Record<string, Stage> = {
  refine: 'refinement',
  decompose: 'decomposition',
  implement: 'implementation',
  review: 'review',
};

// An explicit mention of the app followed by one of the four commands,
// e.g. "@devflow /refine".
const COMMAND_RE = /@devflow\s+\/(refine|decompose|implement|review)\b/i;

// A bare mention of the app with no command, e.g. "@devflow" (ADR-0001: reply
// with the command list, enqueue nothing).
const MENTION_RE = /@devflow\b/i;

/** Resolve a slash command in a comment body to its Stage, or undefined. */
function commandToStage(body: string): Stage | undefined {
  const command = COMMAND_RE.exec(body)?.[1]?.toLowerCase();
  return command ? COMMAND_TO_STAGE[command] : undefined;
}

export function parse(event: WebhookEvent): ParseResult {
  if (event.type === 'issue_comment') {
    const body = event.comment.body;
    const stage = commandToStage(body);
    if (stage) {
      return {
        kind: 'trigger',
        trigger: {
          stage,
          target: {
            kind: event.issue.isPullRequest ? 'pr' : 'issue',
            number: event.issue.number,
            repo: event.repo,
          },
          triggerKey: `comment:${event.comment.id}`,
        },
      };
    }

    if (MENTION_RE.test(body)) {
      return {
        kind: 'help',
        replyTo: { repo: event.repo, issueNumber: event.issue.number },
      };
    }
  }

  // Implicit trigger: an issue opt-in via the `devflow` activation label
  // (ADR-0001). Fires on open with the label, or when the label is added.
  if (event.type === 'issues') {
    const activates = event.action === 'opened' || event.action === 'labeled';
    if (activates && event.issue.labels.includes('devflow')) {
      return {
        kind: 'trigger',
        trigger: {
          stage: 'refinement',
          target: {
            kind: 'issue',
            number: event.issue.number,
            repo: event.repo,
          },
          triggerKey: `issue-label:${event.issue.number}`,
        },
      };
    }
  }

  return { kind: 'ignore' };
}
