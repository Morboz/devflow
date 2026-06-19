import { describe, expect, it } from 'vitest';
import { adaptEvent } from '../src/webhook/adapter.js';

const repo = { owner: { login: 'Morboz' }, name: 'devflow' };

describe('adaptEvent', () => {
  it('adapts an issue_comment.created payload into our WebhookEvent', () => {
    const event = adaptEvent('issue_comment', {
      action: 'created',
      repository: repo,
      issue: { number: 42 },
      comment: { id: 999, body: '@devflow /refine' },
    });

    expect(event).toEqual({
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 42, isPullRequest: false },
      comment: { id: 999, body: '@devflow /refine' },
    });
  });

  it('flags isPullRequest when the issue carries a pull_request object', () => {
    const event = adaptEvent('issue_comment', {
      action: 'created',
      repository: repo,
      issue: { number: 7, pull_request: { url: 'x' } },
      comment: { id: 1, body: '@devflow /review' },
    });
    expect(event?.type).toBe('issue_comment');
    if (event?.type !== 'issue_comment') throw new Error('unreachable');
    expect(event.issue.isPullRequest).toBe(true);
  });

  it('adapts an issues.opened payload, mapping label names', () => {
    const event = adaptEvent('issues', {
      action: 'opened',
      repository: repo,
      issue: { number: 55, labels: [{ name: 'devflow' }] },
    });

    expect(event).toEqual({
      type: 'issues',
      action: 'opened',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 55, labels: ['devflow'] },
    });
  });

  it('returns null for events we do not handle', () => {
    expect(adaptEvent('push', { repository: repo })).toBeNull();
    expect(
      adaptEvent('issue_comment', { action: 'deleted', repository: repo }),
    ).toBeNull();
  });
});
