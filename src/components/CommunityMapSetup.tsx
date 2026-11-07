import { useEffect, useRef, useState } from 'react';
import { call } from '../api';
import type { RuntimeId, OpenProject } from '../types';
import type { CommunityJoinAssessment, CommunityServer } from '../runtimeWorkbench';
import { MAP_CATALOG } from '../mapCatalog';
import MapDownload from './MapDownload';
import { Notice } from './ui';
/** Setup composes the existing downloader and native validators; never launches a game. */
export default function CommunityMapSetup({
  server,
  runtime,
  assessment,
  onReady,
}: {
  server: CommunityServer;
  runtime: RuntimeId;
  assessment: CommunityJoinAssessment;
  onReady: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const missingMap = assessment.issues.some((issue) => issue.code === 'missingMap');
  const missingBanks = assessment.issues.some((issue) => issue.code === 'missingMapResources');
  const ce = server.map.family === 'customEdition';
  const match = MAP_CATALOG.find(
    (item) =>
      item.edition === 'halo-ce' &&
      item.title.toLowerCase().replaceAll(' ', '_') === server.map.name.toLowerCase(),
  );
  async function resources() {
    if (!assessment.dataRoot) return;
    setBusy(true);
    setError('');
    try {
      await call('prepare_runtime_ce_resources', {
        registrationId: assessment.registrationId,
        expectedDataRoot: assessment.dataRoot,
      });
      if (mounted.current) {
        setMessage('CE resources verified. Rechecking this game…');
        onReady();
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function downloaded(opened: OpenProject[]) {
    if (!mounted.current) return;
    // A ZIP can hold multiple maps. Do not guess which one is this server's map.
    const candidates = opened.filter(
      (item) => item.inspection?.header?.name?.toLowerCase() === server.map.name.toLowerCase(),
    );
    if (candidates.length !== 1)
      throw Error(
        'The download does not contain one unambiguous matching map. Imported files remain in your library.',
      );
    await call('install_downloaded_community_map', {
      serverId: server.id,
      runtimeId: runtime,
      projectId: candidates[0].project.id,
      expectedRegistrationId: assessment.registrationId,
      expectedDataRoot: assessment.dataRoot,
      expectedExecutableSha256: assessment.executableSha256,
    });
    if (mounted.current) {
      setMessage('Matching native map set up. The game still checks the server’s map version.');
      onReady();
    }
  }
  if (!missingMap && !missingBanks) return null;
  return (
    <section className="community-map-setup" aria-label="Set up selected game content">
      {missingBanks && ce && (
        <button disabled={busy || !assessment.dataRoot} onClick={() => void resources()}>
          Find and set up CE resource banks
        </button>
      )}
      {missingMap && !server.map.pack && ['xbox', 'customEdition'].includes(server.map.family) && (
        <details>
          <summary>Download and set up {server.map.displayName}</summary>
          <p className="subtle">
            Use the author’s direct map or ZIP link. The listing supplies no verified download URL or map
            hash. Spark checks the edition and map name, prepares required CE banks from your owned
            installation, and preserves existing different files.
          </p>
          <MapDownload
            key={JSON.stringify([runtime, server.id, assessment.registrationId, assessment.dataRoot, assessment.executableSha256])}
            contextKey={'community.' + server.id}
            compact
            downloadLabel="Download, verify & set up"
            busy={busy}
            onDownloaded={downloaded}
            selection={match?.directDownload ? { url: match.directDownload, label: match.title } : null}
          />
        </details>
      )}
      {message && <Notice tone="info">{message}</Notice>}
      {error && <Notice>{error}</Notice>}
    </section>
  );
}
