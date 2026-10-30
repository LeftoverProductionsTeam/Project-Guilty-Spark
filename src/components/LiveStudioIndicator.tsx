import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { call, native } from '../api';
import type { StudioInfo, StudioView } from '../studioClient';
import './studio.css';
export default function LiveStudioIndicator({
  projectId,
  canHost,
  onOpen,
}: {
  projectId: string | null;
  canHost: boolean;
  onOpen: (id: string) => void;
}) {
  const [state, setState] = useState<{
    projectId: string;
    hosting: boolean;
    view: StudioView | null;
    paused?: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (native)
      void call<StudioInfo | null>('forge_session_status', { projectId: projectId ?? '' }).then(
        (info) => {
          if (active)
            setState(
              info
                ? {
                    projectId: info.projectId,
                    hosting: info.role === 'host',
                    view: info.view,
                    paused: !!info.detail,
                  }
                : null,
            );
        },
        () => {},
      );
    const update = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId: string;
          view: StudioView | null;
          hosting: boolean;
          paused?: boolean;
        }>
      ).detail;
      if (!detail) return;
      setState(detail.view ? detail : null);
    };
    window.addEventListener('guilty-spark-studio-status', update);
    return () => {
      active = false;
      window.removeEventListener('guilty-spark-studio-status', update);
    };
  }, [projectId]);
  const label = state ? (state.paused ? 'Paused' : state.hosting ? 'Hosting' : 'Connected') : 'Solo';
  return (
    <button
      type="button"
      className="studio-header-button"
      aria-label={`Live Studio · ${label}`}
      title={
        state
          ? 'Open the active shared QuickForge session'
          : 'Host or join shared QuickForge source. Native tag and binary-asset sharing are separate milestones.'
      }
      disabled={!state && (!projectId || !canHost)}
      onClick={() => {
        const id = state?.projectId ?? projectId;
        if (id) onOpen(id);
      }}
    >
      <Users size={15} />
      <span className="studio-header-label">Live Studio</span>
      <strong>{label}</strong>
      {state?.view && <small>{state.view.peers}</small>}
    </button>
  );
}
