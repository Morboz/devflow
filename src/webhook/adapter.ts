import type { WebhookEvent } from '../domain/types.js';

interface RepoPayload {
  repository: { owner: { login: string }; name: string };
}

function repoOf(payload: unknown): { owner: string; name: string } | null {
  const repository = (payload as Partial<RepoPayload>).repository;
  const owner = repository?.owner?.login;
  const name = repository?.name;
  return owner && name ? { owner, name } : null;
}

/**
 * Adapt a raw @octokit/webhooks event (name + payload) into our WebhookEvent,
 * or null for events we do not handle. Keeps the octokit payload shape out of
 * the parser, so the parser stays pure.
 */
export function adaptEvent(name: string, payload: unknown): WebhookEvent | null {
  const repo = repoOf(payload);
  if (!repo) return null;

  if (name === 'issue_comment') {
    const p = payload as RepoPayload & {
      action: string;
      issue: { number: number; pull_request?: unknown };
      comment: { id: number; body: string };
    };
    if (p.action !== 'created') return null;
    return {
      type: 'issue_comment',
      action: 'created',
      repo,
      issue: { number: p.issue.number, isPullRequest: !!p.issue.pull_request },
      comment: { id: p.comment.id, body: p.comment.body },
    };
  }

  if (name === 'issues') {
    const p = payload as RepoPayload & {
      action: string;
      issue: { number: number; labels?: { name: string }[] };
    };
    if (p.action !== 'opened' && p.action !== 'labeled') return null;
    const labels = p.issue.labels?.map((l) => l.name) ?? [];
    return {
      type: 'issues',
      action: p.action as 'opened' | 'labeled',
      repo,
      issue: { number: p.issue.number, labels },
    };
  }

  return null;
}
