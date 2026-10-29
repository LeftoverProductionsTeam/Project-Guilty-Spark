import type { ReactNode } from 'react';
export default function SettingsPanel({
  tab,
  onTab,
  children,
}: {
  tab: 'tools' | 'interface' | 'dependencies';
  onTab: (tab: 'tools' | 'interface' | 'dependencies') => void;
  children: ReactNode;
}) {
  return (
    <div className="gs-settings-workspace">
      <div className="gs-settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          role="tab"
          id="settings-dependencies-tab"
          aria-selected={tab === 'dependencies'}
          aria-controls="settings-content"
          onClick={() => onTab('dependencies')}
        >
          Dependencies &amp; setup
        </button>
        <button
          role="tab"
          id="settings-tools-tab"
          aria-selected={tab === 'tools'}
          aria-controls="settings-content"
          onClick={() => onTab('tools')}
        >
          Games &amp; tools
        </button>
        <button
          role="tab"
          id="settings-interface-tab"
          aria-selected={tab === 'interface'}
          aria-controls="settings-content"
          onClick={() => onTab('interface')}
        >
          Interface Studio
        </button>
      </div>
      <div id="settings-content" role="tabpanel" aria-labelledby={`settings-${tab}-tab`}>
        {children}
      </div>
    </div>
  );
}
