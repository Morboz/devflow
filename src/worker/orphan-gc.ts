import type { RepoGitHub } from '../github/client.js';

export type Repo = { owner: string; name: string };

const DEFAULT_MAX_AGE_HOURS = 24;

/**
 * Pure: should this branch be deleted by orphan GC? A `devflow/*` branch with
 * no linked PR (any state — GitHub is the source of truth, ADR-0007) older than
 * the threshold. The 24h threshold avoids nuking a branch a running Job just
 * pushed but hasn't opened a PR for yet.
 */
export function shouldDeleteBranch(
  branch: { name: string; prCount: number; ageHours: number },
  maxAgeHours: number = DEFAULT_MAX_AGE_HOURS,
): boolean {
  return (
    branch.name.startsWith('devflow/') &&
    branch.prCount === 0 &&
    branch.ageHours > maxAgeHours
  );
}

/**
 * Sweep the repo's `devflow/*` branches and delete orphans (no PR + older than
 * maxAgeHours). Returns the deleted branch names. `now` is injected so the
 * sweep is deterministic in tests.
 */
export async function sweepOrphanBranches(
  gh: RepoGitHub,
  repo: Repo,
  opts: { now: Date; maxAgeHours?: number },
): Promise<string[]> {
  const maxAgeHours = opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const deleted: string[] = [];

  for (const name of await gh.listBranches(repo.owner, repo.name)) {
    if (!name.startsWith('devflow/')) continue;

    const [prCount, commitIso] = await Promise.all([
      gh.countPullRequestsForBranch(repo.owner, repo.name, name),
      gh.getBranchCommitDate(repo.owner, repo.name, name),
    ]);
    const ageHours =
      (opts.now.getTime() - new Date(commitIso).getTime()) / 3_600_000;

    if (shouldDeleteBranch({ name, prCount, ageHours }, maxAgeHours)) {
      await gh.deleteBranch(repo.owner, repo.name, name);
      deleted.push(name);
    }
  }

  return deleted;
}
