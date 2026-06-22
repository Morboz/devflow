import type { ParseResult, Stage, WebhookEvent } from '../domain/types.js';

// Slash command name -> Stage. Command name is the Stage's surface form (ADR-0001).
const COMMAND_TO_STAGE: Record<string, Stage> = {
  refine: 'refinement',
  decompose: 'decomposition',
  implement: 'implementation',
  review: 'review',
};

/** Escape a string for literal interpolation into a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the command/mention regexes for the app's slug. Matches `@<slug>`
 * optionally followed by `[bot]` — GitHub renders app mentions as
 * `@<slug>[bot]`, but a typed-as-text `@<slug>` should also work, so both
 * `@mbzdevflow /refine` and `@mbzdevflow[bot] /refine` trigger.
 */
function mentionRegexes(botSlug: string): { command: RegExp; mention: RegExp } {
  const slug = escapeRe(botSlug);
  return {
    command: new RegExp(
      `@${slug}(?:\\[bot\\])?\\s+\\/(refine|decompose|implement|review)\\b`,
      'i',
    ),
    mention: new RegExp(`@${slug}(?:\\[bot\\])?\\b`, 'i'),
  };
}

/** Resolve a slash command in a comment body to its Stage, or undefined. */
function commandToStage(body: string, commandRe: RegExp): Stage | undefined {
  const command = commandRe.exec(body)?.[1]?.toLowerCase();
  return command ? COMMAND_TO_STAGE[command] : undefined;
}

export function parse(event: WebhookEvent, botSlug = 'mbzdevflow'): ParseResult {
  const { command: commandRe, mention: mentionRe } = mentionRegexes(botSlug);
  if (event.type === 'issue_comment') {
    const body = event.comment.body;
    const stage = commandToStage(body, commandRe);
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

    if (mentionRe.test(body)) {
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
