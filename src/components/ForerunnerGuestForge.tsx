import { useState } from 'react';
import { verifyForerunnerGuestForge } from '../runtimeWorkbench';
import { Notice } from './ui';

export default function ForerunnerGuestForge({ requiresPhysics, shared = false }: {
  requiresPhysics: boolean;
  shared?: boolean;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyForerunnerGuestForge>>>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function check() {
    setResult(undefined);
    setError('');
    setChecking(true);
    try {
      setResult(await verifyForerunnerGuestForge(requiresPhysics));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  }

  const exportLabel = shared
    ? requiresPhysics ? 'Export shared HMV for hosted Forge' : 'Export shared HMV for Forerunner'
    : requiresPhysics ? 'Export for Forerunner hosted physics' : 'Export for Forerunner';

  return (
    <details className="forerunner-guest-forge">
      <summary>Forerunner guest editing</summary>
      <button type="button" disabled={checking} onClick={() => void check()}>
        {checking ? 'Checking reviewed runtime…' : 'Check reviewed runtime'}
      </button>
      {error && <div role="alert"><Notice tone="error">{error}</Notice></div>}
      {result && <>
        <p role="status">Reviewed on this computer · {result.profile} · {result.placements ? 'Rotation and placement' : 'Rotation'}{result.livePhysics && ' · Live physics'}</p>
        <ol className="subtle">
          <li>Use <strong>{exportLabel}</strong>. Put <code>import.hmv</code> in the matching <code>forge/&lt;map&gt;/</code> folder under the host’s save directory.</li>
          <li>Before starting the private session, set <code>network.forge_guest_edits = true</code> in the host’s Forerunner configuration. Host and guests need compatible builds. In the session, the host uses <strong>Forge Tools → Load Layout (.HMV)</strong>.</li>
          <li>A guest aims at an unused copy and uses <strong>Forge Tools → Rotate Aimed Copy</strong>.
            {result.placements && <> Guests can also use <strong>Select Aimed Object</strong>, <strong>Place Copy</strong>, <strong>Move Selected Copy</strong> and <strong>Remove Aimed Copy</strong>.</>} The host approves edits and can undo or redo them.</li>
          {result.livePhysics && <li>Use <strong>Forge Tools → Change Physics</strong> to cycle Normal, Fixed and Phased on an eligible vehicle, weapon or equipment copy. All joined players need Forge physics support. If restoring Normal is refused, move the copy clear of other solid objects and try again.</li>}
          <li>When finished, the host uses <strong>Save Layout (.HMV)</strong>. Open the same base map in Spark and use <strong>Forge layouts → Replace current Forge layout</strong> to bring the saved result back.</li>
        </ol>
      </>}
    </details>
  );
}
