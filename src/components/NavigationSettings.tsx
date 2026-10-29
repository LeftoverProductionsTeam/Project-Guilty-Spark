import { useMapState } from '../mapSession';
import { DEFAULT_NAVIGATION, navigationConfig } from '../editorFlight';
export default function NavigationSettings() {
  const [raw, set] = useMapState('global', 'navigation.config', DEFAULT_NAVIGATION),
    config = navigationConfig(raw);
  return (
    <div className="gs-navigation-settings">
      <p>
        Hold the right mouse button to look and fly. Middle mouse pans; Shift boosts speed. Scroll while
        flying to adjust speed. Release right mouse for normal zoom and editing.
      </p>
      <label>
        Movement speed
        <input
          type="number"
          aria-label="Camera movement speed"
          min="0.2"
          max="100"
          step="0.5"
          value={config.speed}
          onChange={(e) => set({ ...config, speed: Number(e.target.value) })}
        />
      </label>
      <label>
        Look sensitivity
        <input
          type="range"
          aria-label="Camera look sensitivity"
          min="0.0002"
          max="0.01"
          step="0.0002"
          value={config.sensitivity}
          onChange={(e) => set({ ...config, sensitivity: Number(e.target.value) })}
        />
      </label>
      {Object.entries(config.bindings).map(([name, code]) => (
        <label key={name}>
          Move {name}
          <select
            aria-label={`Camera move ${name}`}
            value={code}
            onChange={(e) => {
              const next = { ...config.bindings, [name]: e.target.value };
              if (new Set(Object.values(next)).size !== 6) return;
              set({ ...config, bindings: next });
            }}
          >
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
              <option
                key={letter}
                value={`Key${letter}`}
                disabled={Object.entries(config.bindings).some(
                  ([other, value]) => other !== name && value === `Key${letter}`,
                )}
              >
                {letter}
              </option>
            ))}
          </select>
        </label>
      ))}
      <p>F frames your selection. Camera keys are ignored in text fields and dialogs.</p>
      <button onClick={() => set(DEFAULT_NAVIGATION)}>Reset camera shortcuts</button>
    </div>
  );
}
