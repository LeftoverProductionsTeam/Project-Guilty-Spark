import { ExternalLink, PackageOpen, X } from 'lucide-react';
import type { MapDocuments } from '../mapDocuments';
export default function MapTabs({
  state,
  disabled,
  onSelect,
  onClose,
  onWindow,
  onAssets,
}: {
  state: MapDocuments;
  disabled: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onWindow: (id: string) => void;
  onAssets: () => void;
}) {
  if (!state.documents.length) return null;
  return (
    <div className="map-tab-bar">
      <div className="map-tabs" role="tablist" aria-label="Open maps">
        {state.documents.map((d) => (
          <div className={'map-tab' + (d.id === state.activeId ? ' active' : '')} key={d.id}>
            <button
              role="tab"
              aria-selected={d.id === state.activeId}
              tabIndex={d.id === state.activeId ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const list = e.currentTarget.closest('[role=tablist]'),
                  i = state.documents.indexOf(d),
                  n =
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? state.documents.length - 1
                        : (i + (e.key === 'ArrowRight' ? 1 : -1) + state.documents.length) %
                          state.documents.length;
                onSelect(state.documents[n].id);
                requestAnimationFrame(() =>
                  list?.querySelectorAll<HTMLButtonElement>('[role=tab]')[n]?.focus(),
                );
              }}
              title={d.history.current?.source?.scenarioPath ?? 'Editable source project'}
            >
              {d.history.dirty && <span aria-label="Unsaved changes">● </span>}
              {d.history.current?.title}
            </button>
            <button
              className="map-tab-action"
              title="Open map in another window"
              aria-label={'Open ' + d.history.current?.title + ' in another window'}
              disabled={disabled}
              onClick={() => onWindow(d.id)}
            >
              <ExternalLink size={12} />
            </button>
            <button
              className="map-tab-action"
              title="Save and close map tab"
              aria-label={'Save and close ' + d.history.current?.title}
              disabled={disabled}
              onClick={() => onClose(d.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="small-button" disabled={disabled} onClick={onAssets}>
        <PackageOpen size={14} /> Transfer assets
      </button>
    </div>
  );
}
