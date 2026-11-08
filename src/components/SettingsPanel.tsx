import PagedSurface from './PagedSurface';
import { Suspense, type ReactNode } from 'react';
export default function SettingsPanel({
  tab,
  onTab,
  children,
}: {
  tab: 'tools' | 'interface' | 'dependencies' | 'storage';
  onTab: (tab: 'tools' | 'interface' | 'dependencies' | 'storage') => void;
  children: ReactNode;
}) {
  return (
    <div className="gs-settings-workspace">
      <div
        className="gs-settings-tabs"
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
          if (current < 0) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        <button
          role="tab"
          id="settings-dependencies-tab"
          aria-selected={tab === 'dependencies'}
          tabIndex={tab === 'dependencies' ? 0 : -1}
          aria-controls="settings-content"
          onClick={() => onTab('dependencies')}
        >
          Dependencies &amp; setup
        </button>
        <button
          role="tab"
          id="settings-tools-tab"
          aria-selected={tab === 'tools'}
          tabIndex={tab === 'tools' ? 0 : -1}
          aria-controls="settings-content"
          onClick={() => onTab('tools')}
        >
          Games &amp; tools
        </button>
        <button
          role="tab"
          id="settings-interface-tab"
          aria-selected={tab === 'interface'}
          tabIndex={tab === 'interface' ? 0 : -1}
          aria-controls="settings-content"
          onClick={() => onTab('interface')}
        >
          Interface Studio
        </button>
        <button
          role="tab"
          id="settings-storage-tab"
          aria-selected={tab === 'storage'}
          tabIndex={tab === 'storage' ? 0 : -1}
          aria-controls="settings-content"
          onClick={() => onTab('storage')}
        >
          Storage &amp; Cache
        </button>
      </div>
      <div id="settings-content" role="tabpanel" aria-labelledby={`settings-${tab}-tab`}>
        <Suspense
          fallback={
            <div className="loading" role="status">
              Opening settings…
            </div>
          }
        >
          {tab==='tools'?children:<PagedSurface name={'settings-'+tab} label={'Settings '+tab} fill>{children}</PagedSurface>}
        </Suspense>
      </div>
    </div>
  );
}
