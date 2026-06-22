import { describe, expect, it } from 'vitest';
import {
  checkInstallationGrant,
  REQUIRED_APP_EVENTS,
  REQUIRED_APP_PERMISSIONS,
} from '../src/github/auth.js';

/** A grant that exactly satisfies ADR-0008. */
const good = {
  permissions: { ...REQUIRED_APP_PERMISSIONS },
  events: [...REQUIRED_APP_EVENTS],
};

describe('checkInstallationGrant', () => {
  it('passes when the grant is exactly the four permissions and three events', () => {
    const result = checkInstallationGrant(good);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('fails when a required permission is missing', () => {
    const perms = { ...REQUIRED_APP_PERMISSIONS };
    delete perms['contents'];
    const result = checkInstallationGrant({ ...good, permissions: perms });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("'contents'"))).toBe(true);
  });

  it('fails when a required permission is at the wrong level', () => {
    const result = checkInstallationGrant({
      ...good,
      permissions: { ...REQUIRED_APP_PERMISSIONS, contents: 'read' },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("'contents'"))).toBe(true);
  });

  it('fails on any permission beyond the allowed four (no Workflows/Admin/Org)', () => {
    const result = checkInstallationGrant({
      ...good,
      permissions: { ...REQUIRED_APP_PERMISSIONS, workflows: 'write' },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("'workflows'"))).toBe(true);
  });

  it('fails when a required event subscription is missing', () => {
    const result = checkInstallationGrant({
      ...good,
      events: ['issues', 'pull_request'],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("'issue_comment'"))).toBe(true);
  });

  it('is lenient about extra (non-required) events', () => {
    const result = checkInstallationGrant({
      ...good,
      events: [...REQUIRED_APP_EVENTS, 'push'],
    });
    expect(result.ok).toBe(true);
  });
});
