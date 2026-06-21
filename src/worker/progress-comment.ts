import type { RepoGitHub } from '../github/client.js';

export type ProgressRef = { owner: string; repo: string; issueNumber: number };

/**
 * A Job's progress comment (an attachment, not an Artifact). Exactly ONE
 * comment per Job: an occupying line on start, edited in place at coarse
 * milestones, with a terminal ✅/❌ line. No time-based heartbeat (D9).
 *
 * Takes the GitHub boundary interface, so the lifecycle is unit-testable
 * with a fake.
 */
export class ProgressComment {
  private commentId?: number;
  private body = '';

  constructor(
    private readonly gh: RepoGitHub,
    private readonly ref: ProgressRef,
  ) {}

  /** Post the occupying "started" comment. Called once, on Job start. */
  async occupy(stage: string): Promise<void> {
    this.body = `🤖 \`${stage}\` started`;
    this.commentId = await this.gh.createIssueComment(
      this.ref.owner,
      this.ref.repo,
      this.ref.issueNumber,
      this.body,
    );
  }

  /** Append a coarse milestone by editing the same comment in place. */
  async milestone(text: string): Promise<void> {
    this.body = `${this.body}\n- ${text}`;
    await this.edit();
  }

  /** Terminal success line. */
  async done(summary = ''): Promise<void> {
    this.body = `${this.body}\n\n✅ done${summary ? ` — ${summary}` : ''}`;
    await this.edit();
  }

  /** Terminal failure line. */
  async failed(reason: string): Promise<void> {
    this.body = `${this.body}\n\n❌ failed: ${reason}`;
    await this.edit();
  }

  private async edit(): Promise<void> {
    if (this.commentId === undefined) {
      throw new Error('ProgressComment: occupy() must be called first');
    }
    await this.gh.updateIssueComment(
      this.ref.owner,
      this.ref.repo,
      this.commentId,
      this.body,
    );
  }
}
