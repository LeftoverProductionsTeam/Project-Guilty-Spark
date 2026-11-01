import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from './api';
import type { Bootstrap, RuntimeId, RuntimeReport } from './types';

export const primaryRuntimes: RuntimeId[] = ['mccSteam', 'openCe', 'chupathingyCe', 'haloCustomEdition'];
export interface DetectedHalo {
  runtimeId: RuntimeId;
  root: string;
  executable: string;
  dataRoot: string;
  executableSha256: string;
  version: string | null;
  contentReady: boolean;
  detail: string;
}
export function useRuntimeConnections(data: Bootstrap) {
  const [reports, setReports] = useState<RuntimeReport[]>([]);
  const [detected, setDetected] = useState<DetectedHalo[]>([]);
  const [checking, setChecking] = useState(false), [connecting, setConnecting] = useState<RuntimeId | null>(null), [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!native) return;
    setChecking(true); setError('');
    const [registered, candidates] = await Promise.allSettled([
      call<RuntimeReport[]>('runtime_report'), call<DetectedHalo[]>('discover_halo_connections'),
    ]);
    if (version !== generation.current) return;
    setReports(registered.status === 'fulfilled' ? registered.value : []);
    setDetected(candidates.status === 'fulfilled' ? candidates.value : []);
    setError([registered, candidates].filter(result => result.status === 'rejected').map(result => String((result as PromiseRejectedResult).reason)).join(' '));
    setChecking(false);
  }, [data.dataDirectory, data.settings.mccDirectory, data.settings.steamDirectory]);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  const connect = async (candidate: DetectedHalo) => {
    const version = generation.current;
    setConnecting(candidate.runtimeId); setError('');
    try {
      const next = await call<RuntimeReport[]>('connect_detected_halo', { runtimeId: candidate.runtimeId, executableSha256: candidate.executableSha256 });
      if (version === generation.current) { setReports(next); setDetected(old => old.filter(item => item.runtimeId !== candidate.runtimeId)); }
      window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      if (version === generation.current) setError(String(e));
    } finally {
      if (version === generation.current) setConnecting(null);
    }
  };
  return { reports, detected, checking, connecting, error, refresh, connect };
}
