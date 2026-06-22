import { describe, it, expect } from 'vitest';
import { parse } from '../src/webhook/parser.js';
import type { WebhookEvent } from '../src/domain/types.js';

describe('parser', () => {
  it('parses @mbzdevflow /refine on an issue comment into a refinement Trigger', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 42, isPullRequest: false },
      comment: { id: 999, body: '@mbzdevflow /refine' },
    };

    const result = parse(event);

    expect(result).toEqual({
      kind: 'trigger',
      trigger: {
        stage: 'refinement',
        target: {
          kind: 'issue',
          number: 42,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'comment:999',
      },
    });
  });

  it.each([
    ['decompose', 'decomposition'],
    ['implement', 'implementation'],
    ['review', 'review'],
  ] as const)('parses @mbzdevflow /%s into a %s Trigger', (command, stage) => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 7, isPullRequest: false },
      comment: { id: 100, body: `@mbzdevflow /${command}` },
    };

    expect(parse(event)).toEqual({
      kind: 'trigger',
      trigger: {
        stage,
        target: {
          kind: 'issue',
          number: 7,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'comment:100',
      },
    });
  });

  it('targets a pr when @mbzdevflow /review is on a pull request comment', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 12, isPullRequest: true },
      comment: { id: 200, body: '@mbzdevflow /review' },
    };

    const result = parse(event);

    expect(result).toEqual({
      kind: 'trigger',
      trigger: {
        stage: 'review',
        target: {
          kind: 'pr',
          number: 12,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'comment:200',
      },
    });
  });

  it('replies with help when @mbzdevflow is mentioned with no command', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 30, isPullRequest: false },
      comment: { id: 300, body: '@mbzdevflow' },
    };

    expect(parse(event)).toEqual({
      kind: 'help',
      replyTo: { repo: { owner: 'Morboz', name: 'devflow' }, issueNumber: 30 },
    });
  });

  it('ignores a comment that does not mention @mbzdevflow', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 30, isPullRequest: false },
      comment: { id: 301, body: 'looks good to me' },
    };

    expect(parse(event)).toEqual({ kind: 'ignore' });
  });

  it('triggers refinement when a new issue is opened with the devflow label', () => {
    const event: WebhookEvent = {
      type: 'issues',
      action: 'opened',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 55, labels: ['devflow'] },
    };

    expect(parse(event)).toEqual({
      kind: 'trigger',
      trigger: {
        stage: 'refinement',
        target: {
          kind: 'issue',
          number: 55,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'issue-label:55',
      },
    });
  });

  it('ignores a new issue without the devflow label', () => {
    const event: WebhookEvent = {
      type: 'issues',
      action: 'opened',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 56, labels: ['bug'] },
    };

    expect(parse(event)).toEqual({ kind: 'ignore' });
  });

  it('also triggers when GitHub renders the mention as @<slug>[bot]', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 77, isPullRequest: false },
      comment: { id: 500, body: '@mbzdevflow[bot] /refine' },
    };

    expect(parse(event)).toEqual({
      kind: 'trigger',
      trigger: {
        stage: 'refinement',
        target: {
          kind: 'issue',
          number: 77,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'comment:500',
      },
    });
  });

  it('honors a custom slug passed to parse', () => {
    const event: WebhookEvent = {
      type: 'issue_comment',
      action: 'created',
      repo: { owner: 'Morboz', name: 'devflow' },
      issue: { number: 88, isPullRequest: false },
      comment: { id: 600, body: '@mybot /refine' },
    };

    expect(parse(event, 'mybot')).toEqual({
      kind: 'trigger',
      trigger: {
        stage: 'refinement',
        target: {
          kind: 'issue',
          number: 88,
          repo: { owner: 'Morboz', name: 'devflow' },
        },
        triggerKey: 'comment:600',
      },
    });
  });
});
