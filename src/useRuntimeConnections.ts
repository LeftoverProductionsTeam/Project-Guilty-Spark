import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from './api';
import type { Bootstrap, RuntimeId, RuntimeReport, RuntimeRegistration } from './types';
import {PREFERRED_RUNTIME} from './runtimeWorkbench';

export const primaryRuntimes = [PREFERRED_RUNTIME, 'mccSteam', 'haloCustomEdition', 'openCe', 'arenaEvolved'] as const satisfies readonly RuntimeId[];
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
  const [profiles,setProfiles]=useState<RuntimeRegistration[]>([]);
  const [detected, setDetected] = useState<DetectedHalo[]>([]);
  const [checking, setChecking] = useState(false), [connecting, setConnecting] = useState<RuntimeId | null>(null), [error, setError] = useState('');
  const generation = useRef(0);
  const connectionAttempt = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!native) return;
    setChecking(true); setError('');
    const [registered, candidates, saved] = await Promise.allSettled([
      call<RuntimeReport[]>('runtime_report'), call<DetectedHalo[]>('discover_halo_connections'),call<RuntimeRegistration[]>('list_runtime_registrations'),
    ]);
    if (version !== generation.current) return;
    setReports(registered.status === 'fulfilled' ? registered.value : []);
    setDetected(candidates.status === 'fulfilled' ? candidates.value : []);
    setError([registered, candidates].filter(result => result.status === 'rejected').map(result => String((result as PromiseRejectedResult).reason)).join(' '));
    setProfiles(saved.status==='fulfilled'?saved.value??[]:[]);
    setChecking(false);
  }, [data.dataDirectory, data.settings.mccDirectory, data.settings.steamDirectory]);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  useEffect(()=>{const changed=()=>void refresh();window.addEventListener('guilty-spark-runtime-connections-changed',changed);return()=>window.removeEventListener('guilty-spark-runtime-connections-changed',changed);},[refresh]);
  const connect = async (candidate: DetectedHalo) => {
    const version = generation.current;
    const attempt = ++connectionAttempt.current;
    setConnecting(candidate.runtimeId); setError('');
    try {
      const next = await call<RuntimeReport[]>('connect_detected_halo', { runtimeId: candidate.runtimeId, executableSha256: candidate.executableSha256 });
      if (version === generation.current) { setReports(next); setDetected(old => old.filter(item => item.executableSha256 !== candidate.executableSha256)); }
      if (mounted.current) window.dispatchEvent(new Event('guilty-spark-runtime-connections-changed'));
    } catch (e) {
      if (version === generation.current) setError(String(e));
    } finally {
      // A read-only refresh can supersede discovery while connection is in
      // flight. It must not strand the Connect button in its busy state.
      if (mounted.current && attempt === connectionAttempt.current) setConnecting(null);
    }
  };
  return { reports, detected, profiles, checking, connecting, error, refresh, connect };
}
