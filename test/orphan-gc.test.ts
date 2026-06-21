import { describe, expect, it } from 'vitest';
import { shouldDeleteBranch, sweepOrphanBranches } from '../src/worker/orphan-gc.js';
import type { RepoGitHub } from '../src/github/client.js';

class FakeGitHub implements RepoGitHub {
  deleted: string[] = [];
  constructor(private branches: { name: string; prCount: number; commitIso: string }[]) {}

  async listBranches() {
    return this.branches.map((b) => b.name);
  }
  async countPullRequestsForBranch(_o: string, _r: string, branch: string) {
    return this.branches.find((b) => b.name === branch)!.prCount;
  }
  async getBranchCommitDate(_o: string, _r: string, branch: string) {
    return this.branches.find((b) => b.name === branch)!.commitIso;
  }
  async deleteBranch(_o: string, _r: string, branch: string) {
    this.deleted.push(branch);
  }
  async createIssueComment() {
    return 0;
  }
  async updateIssueComment() {
    /* noop */
  }
}

describe('orphan GC', () => {
  const now = new Date('2026-06-21T12:00:00Z');

  it('shouldDeleteBranch: only devflow/* with no PR and age > 24h (pure)', () => {
    expect(shouldDeleteBranch({ name: 'devflow/x-1', prCount: 0, ageHours: 25 })).toBe(true);
    expect(shouldDeleteBranch({ name: 'devflow/x-1', prCount: 0, ageHours: 5 })).toBe(false); // too fresh
    expect(shouldDeleteBranch({ name: 'devflow/x-1', prCount: 1, ageHours: 25 })).toBe(false); // has PR
    expect(shouldDeleteBranch({ name: 'main', prCount: 0, ageHours: 25 })).toBe(false); // not devflow/
  });

  it('deletes old orphans, keeps branches with a PR, fresh branches, and non-devflow branches (D10)', async () => {
    const gh = new FakeGitHub([
      { name: 'devflow/old-1', prCount: 0, commitIso: '2026-06-19T00:00:00Z' }, // ~60h old -> delete
      { name: 'devflow/has-pr', prCount: 1, commitIso: '2026-06-19T00:00:00Z' }, // has PR -> keep
      { name: 'devflow/fresh', prCount: 0, commitIso: '2026-06-21T10:00:00Z' }, // ~2h old -> keep
      { name: 'main', prCount: 0, commitIso: '2026-06-01T00:00:00Z' }, // not devflow -> keep
    ]);

    const deleted = await sweepOrphanBranches(gh, { owner: 'o', name: 'r' }, { now });

    expect(deleted).toEqual(['devflow/old-1']);
    expect(gh.deleted).toEqual(['devflow/old-1']);
  });
});
