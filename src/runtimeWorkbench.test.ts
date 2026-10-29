import { describe, expect, it } from 'vitest';
import { canHandoff, listingExpired } from './runtimeWorkbench';
import type { CommunityJoinAssessment, CommunityListingView } from './runtimeWorkbench';

const view: CommunityListingView = {
  listing: {
    provider: 'synthetic',
    fetchedAtUnix: 100,
    expiresAtUnix: 130,
    servers: [],
    rejectedRows: 0,
    diagnostics: [],
  },
  stale: false,
  refreshAfterUnix: 130,
  fetching: false,
  error: null,
};
const assessment: CommunityJoinAssessment = {
  readiness: 'readyForRuntimeCheck',
  runtimeId: 'openCe',
  registrationId: 'synthetic',
  issues: [],
  limitations: ['No game connection was tested'],
  connectionOutcome: 'unobserved',
  preflightId: 'synthetic',
  executableSha256: 'a'.repeat(64),
  expiresAtUnix: 130,
};
describe('community invitation freshness', () => {
  it('requires a current listing and native eligibility together', () => {
    expect(canHandoff(assessment, view, 129999)).toBe(true);
    expect(canHandoff({ ...assessment, readiness: 'blocked' }, view, 129999)).toBe(false);
    expect(canHandoff(null, view, 129999)).toBe(false);
    expect(canHandoff(assessment, null, 129999)).toBe(false);
    expect(canHandoff({ ...assessment, preflightId: null }, view, 129999)).toBe(false);
  });
  it('expires at the exact boundary and refuses a stale fallback after refresh failure', () => {
    expect(listingExpired(view, 130000)).toBe(true);
    expect(canHandoff(assessment, view, 130000)).toBe(false);
    expect(canHandoff(assessment, { ...view, stale: true, error: 'Provider unavailable' }, 120000)).toBe(
      false,
    );
  });
});
