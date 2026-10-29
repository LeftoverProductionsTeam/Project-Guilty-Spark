import { call } from './api';
export interface LiveCleanupStatus {
  hasSession: boolean;
  sessionToken: string | null;
  pending: string[];
  detail: string;
}
export interface LiveDisconnectReport {
  outcome: 'restored' | 'retired' | 'noChanges' | 'alreadyDisconnected';
  retiredTarget:
    'processEnded' | 'processReplaced' | 'moduleUnloaded' | 'moduleReplaced' | 'mapChanged' | null;
  detail: string;
}
export async function disconnectLiveSession(sessionToken?: string | null) {
  if (!sessionToken)
    throw Error('Refresh the live connection before releasing it; its session identity is missing.');
  const report = await call<LiveDisconnectReport>('live_mcc_disconnect', {
    expectedSession: sessionToken ?? null,
  });
  if (
    !report ||
    !['restored', 'retired', 'noChanges', 'alreadyDisconnected'].includes(report.outcome) ||
    !report.detail
  )
    throw Error('The desktop did not confirm live-session cleanup. Refresh the connection and retry.');
  return report;
}
