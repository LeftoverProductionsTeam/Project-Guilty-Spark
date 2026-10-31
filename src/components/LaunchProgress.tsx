import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { Orbit, Sparkles } from 'lucide-react';
import './launchProgress.css';
interface Progress {
  phase: string;
  completed: number;
  total: number;
  ready: boolean;
  elapsedMs: number;
}
export default function LaunchProgress() {
  const [progress, setProgress] = useState<Progress>({
    phase: 'Opening your saved workbench',
    completed: 0,
    total: 3,
    ready: false,
    elapsedMs: 0,
  });
  useEffect(() => {
    if (!native) return;
    let alive = true,
      running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const next = await call<Progress>('startup_status');
        if (alive) setProgress(next);
      } catch {
        /* The boot snapshot reports actionable setup errors separately. */
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 300);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const total = Math.max(1, progress.total),
    completed = Math.min(total, Math.max(0, progress.completed));
  return (
    <section className="gs-launch" aria-label="Starting Project Guilty Spark">
      <div className="gs-launch-monitor" aria-hidden="true">
        <Orbit size={76} />
        <Sparkles size={28} />
      </div>
      <p className="gs-launch-eyebrow">PROJECT GUILTY SPARK</p>
      <h1>Your next world is coming online.</h1>
      <p role="status">{progress.phase}…</p>
      <div
        className="gs-launch-track"
        role="progressbar"
        aria-label="Workbench startup"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`${progress.phase}: ${completed} of ${total} startup phases complete`}
      >
        <span style={{ width: `${(completed / total) * 100}%` }} />
        <i />
      </div>
      <small>
        {completed} / {total} ·{' '}
        {progress.elapsedMs > 10000
          ? 'The first local folder check can take longer. Your source files stay untouched.'
          : 'Restoring your setup and connecting your Halo files.'}
      </small>
    </section>
  );
}
