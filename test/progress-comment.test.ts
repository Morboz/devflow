import { describe, expect, it } from 'vitest';
import { ProgressComment } from '../src/worker/progress-comment.js';
import type { RepoGitHub } from '../src/github/client.js';

class FakeGitHub implements RepoGitHub {
  created: { issue: number; body: string; id: number }[] = [];
  updates: { commentId: number; body: string }[] = [];
  private next = 100;

  async createIssueComment(_o: string, _r: string, issue: number, body: string) {
    const id = this.next++;
    this.created.push({ issue, body, id });
    return id;
  }
  async updateIssueComment(_o: string, _r: string, commentId: number, body: string) {
    this.updates.push({ commentId, body });
  }
  async listBranches() {
    return [];
  }
  async countPullRequestsForBranch() {
    return 0;
  }
  async deleteBranch() {
    /* noop */
  }
  async getBranchCommitDate() {
    return '';
  }
}

describe('ProgressComment', () => {
  it('posts exactly one comment and edits it in place through milestones to a terminal line (D9)', async () => {
    const gh = new FakeGitHub();
    const pc = new ProgressComment(gh, { owner: 'o', repo: 'r', issueNumber: 42 });

    await pc.occupy('refinement');
    await pc.milestone('reading intake');
    await pc.milestone('drafting PRD');
    await pc.done('see #57');

    expect(gh.created).toHaveLength(1);
    expect(gh.created[0]!.body).toBe('🤖 `refinement` started');

    // every milestone + terminal update targets the SAME comment id
    expect(gh.updates).toHaveLength(3);
    expect(gh.updates.every((u) => u.commentId === gh.created[0]!.id)).toBe(true);

    const final = gh.updates[2]!.body;
    expect(final).toContain('reading intake');
    expect(final).toContain('drafting PRD');
    expect(final).toContain('✅ done — see #57');
  });

  it('writes a terminal failure line on failure (D9)', async () => {
    const gh = new FakeGitHub();
    const pc = new ProgressComment(gh, { owner: 'o', repo: 'r', issueNumber: 1 });

    await pc.occupy('implementation');
    await pc.failed('tests red');

    expect(gh.updates.at(-1)!.body).toContain('❌ failed: tests red');
  });

  it('throws if a milestone/terminal is called before occupy()', async () => {
    const gh = new FakeGitHub();
    const pc = new ProgressComment(gh, { owner: 'o', repo: 'r', issueNumber: 1 });
    await expect(pc.milestone('x')).rejects.toThrow('occupy()');
  });
});
