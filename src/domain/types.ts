// Domain vocabulary shared across modules. Implementation-free.

export type Repo = { owner: string; name: string };

export const STAGES = [
  'refinement',
  'decomposition',
  'implementation',
  'review',
] as const;
export type Stage = (typeof STAGES)[number];

export type Target = {
  kind: 'issue' | 'pr';
  number: number;
  repo: Repo;
};

export type Trigger = {
  stage: Stage;
  target: Target;
  triggerKey: string;
};

export type CommentRef = {
  repo: Repo;
  issueNumber: number;
};

export type ParseResult =
  | { kind: 'ignore' }
  | { kind: 'help'; replyTo: CommentRef }
  | { kind: 'trigger'; trigger: Trigger };

export type EnqueueResult =
  | { outcome: 'enqueued'; featureId: number; stageRunId: number; jobId: number }
  | { outcome: 'duplicate' }
  | { outcome: 'rejected'; reason: 'stage_in_progress' };

// Minimal event shape the parser consumes. The webhook handler (slice 3) adapts
// @octokit/webhooks events into this shape, keeping the parser free of octokit types.
export type WebhookEvent =
  | {
      type: 'issue_comment';
      action: 'created' | 'edited' | 'deleted';
      repo: Repo;
      issue: { number: number; isPullRequest: boolean };
      comment: { id: number; body: string };
    }
  | {
      type: 'issues';
      action:
        | 'opened'
        | 'reopened'
        | 'labeled'
        | 'unlabeled'
        | 'edited'
        | 'closed';
      repo: Repo;
      issue: { number: number; labels: string[] };
    };
