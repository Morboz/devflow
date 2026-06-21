import type { Octokit } from 'octokit';

/**
 * The GitHub boundary: everything devflow does to GitHub (post/edit comments,
 * list/delete branches, check PRs). Kept as an interface so the Stage logic
 * (progress comments D9, orphan GC D10) is testable with a fake, and the real
 * Octokit calls live in one thin adapter.
 */
export interface RepoGitHub {
  /** Post a comment on an issue/PR; returns the new comment id. */
  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<number>;
  /** Edit an existing comment in place. */
  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<void>;
  /** List all branch names in the repo. */
  listBranches(owner: string, repo: string): Promise<string[]>;
  /** Count PRs (any state) whose head is this branch. */
  countPullRequestsForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<number>;
  /** Delete a branch ref. */
  deleteBranch(owner: string, repo: string, branch: string): Promise<void>;
  /** ISO date of the branch's head commit (for age-based orphan GC). */
  getBranchCommitDate(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string>;
}

/** Octokit-backed implementation of {@link RepoGitHub}. */
export class OctokitGitHub implements RepoGitHub {
  constructor(private readonly octokit: Octokit) {}

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<number> {
    const { data } = await this.octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: issueNumber, body },
    );
    return data.id;
  }

  async updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<void> {
    await this.octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: commentId, body },
    );
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const branches = await this.octokit.paginate(
      'GET /repos/{owner}/{repo}/branches',
      { owner, repo },
    );
    return branches.map((b: { name: string }) => b.name);
  }

  async countPullRequestsForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<number> {
    const { data } = await this.octokit.request(
      'GET /repos/{owner}/{repo}/pulls',
      { owner, repo, head: `${owner}:${branch}`, state: 'all', per_page: 1 },
    );
    return data.length;
  }

  async deleteBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<void> {
    await this.octokit.request(
      'DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}',
      { owner, repo, branch },
    );
  }

  async getBranchCommitDate(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const { data } = await this.octokit.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      { owner, repo, branch },
    );
    return data.commit.commit.committer?.date ?? '';
  }
}
