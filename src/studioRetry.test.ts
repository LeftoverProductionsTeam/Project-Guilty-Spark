import { it, expect } from 'vitest';
import { studioRetryDelay } from './studioRetry';
it('backs off transient network failures and bounds automatic retries', () => {
  expect(
    Array.from({ length: 7 }, (_, i) => studioRetryDelay('Connection refused (os error 10061)', i)),
  ).toEqual([500, 1000, 2000, 4000, 8000, 8000, null]);
  expect(studioRetryDelay('An existing connection was forcibly closed by the remote host', 0)).toBe(500);
  expect(studioRetryDelay('peer closed connection without sending TLS close_notify', 0)).toBe(500);
});
it('never retries identity, TLS, conflicts or corrupted source as network noise', () => {
  for (const error of [
    'TLS certificate rejected',
    'Concurrent edit conflict',
    'Participant authentication failed or was revoked',
    'Source changed while checking',
    'checksum mismatch',
    'Permission denied',
    'SparkLink protocol differs',
    'network timed out: certificate mismatch',
  ])
    expect(studioRetryDelay(error, 0)).toBeNull();
});
