/** Authoring-only mission, cinematic, dedicated server and QA project data.
 *
 * No workflow in this module edits installed Halo files or starts a process.
 * Halo CE server commands are exported ONLY as a validated, user-reviewed
 * plaintext draft. The other runtime families deliberately have no exporter.
 */
export interface MissionBeat {
  id: string;
  title: string;
  objective: string;
  trigger: 'manual' | 'triggerVolume' | 'encounterCleared' | 'timer';
  encounterName: string;
  triggerRef?: string;
  timerSeconds?: number;
}
export interface CameraShot {
  id: string;
  name: string;
  durationMs: number;
  cameraPosition: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
  subtitle: string;
  cameraMarker?: string;
}
export type ServerRuntime = 'haloCustomEdition' | 'haloPC' | 'haloDemo' | 'mcc' | 'openCE' | 'chupathingyCE';
export interface GameTypeDesign {
  id: string;
  /** This is an authoring plan, never a native blam.lst writer. */
  name: string;
  baseVariant: 'slayer'|'ctf'|'oddball'|'king'|'race'|'juggernaut'|'assault';
  teamPlay: boolean;
  scoreLimit: number;
  timeLimitMinutes: number;
  respawnSeconds: number;
  friendlyFire: boolean;
  startingEquipment: 'mapDefault'|'rockets'|'snipers'|'custom';
  specialRules: 'standard'|'infectionConcept'|'firefightConcept';
  /** User-declared confirmation, not a verified filesystem check. */
  nativeStatus: 'draft'|'userConfirmedInGame';
  nativeEvidence: string;
  notes: string;
}
export interface ServerPlan {
  name: string;
  runtime: ServerRuntime;
  maxPlayers: number;
  publicListing: boolean;
  rotation: { id: string; map: string; gameVariant: string }[];
  /** Optional for backwards-compatible v1 project reads. */
  gameTypes?: GameTypeDesign[];
}
export type PlaytestVerdict = 'notRun' | 'pass' | 'fail' | 'blocked';
export interface PlaytestRecord {
  id: string;
  caseId: string;
  target: string;
  verdict: PlaytestVerdict;
  performedAt: string;
  evidence: string;
  notes: string;
  manuallyReported: boolean;
}
export interface CreatorStudioDocument {
  schemaVersion: 1;
  missions: MissionBeat[];
  shots: CameraShot[];
  server: ServerPlan;
  playtests: PlaytestRecord[];
}
export function emptyCreatorStudio(): CreatorStudioDocument {
  return {
    schemaVersion: 1, missions: [], shots: [], playtests: [],
    server: { name: 'Guilty Spark LAN', runtime: 'haloCustomEdition', maxPlayers: 8, publicListing: false, rotation: [], gameTypes: [] },
  };
}
const commandToken = /^[A-Za-z0-9_-]{1,64}$/;
// Stock Halo CE accepts custom game variants with spaces when safely quoted.
const variantToken = /^[A-Za-z0-9_ -]{1,64}$/;
const recordId = /^[A-Za-z0-9_-]{1,72}$/;
const scriptIdent = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
const triggerValues = new Set(['manual', 'triggerVolume', 'encounterCleared', 'timer']);
const runtimes = new Set<ServerRuntime>(['haloCustomEdition', 'haloPC', 'haloDemo', 'mcc', 'openCE', 'chupathingyCE']);
const verdicts = new Set<PlaytestVerdict>(['notRun', 'pass', 'fail', 'blocked']);
const safeText = (s: string, max: number) => typeof s === 'string' && s.length <= max && !/[\x00-\x1f\x7f]/.test(s);
const boundedPos = (v: number[]) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 4096);
/** Validates the exact schema persisted in the Rust project. */
export function validateCreatorStudio(doc: CreatorStudioDocument): string[] {
  const failures: string[] = [];
  if (!doc || doc.schemaVersion !== 1) return ['Unsupported Creator Studio schema'];
  if (!Array.isArray(doc.missions) || !Array.isArray(doc.shots) || !Array.isArray(doc.playtests) || !doc.server) return ['Missing Studio collection'];
  if (doc.missions.length > 128 || doc.shots.length > 256 || doc.playtests.length > 500 || !Array.isArray(doc.server.rotation) || doc.server.rotation.length > 128)
    return ['Creator Studio collection exceeds safe limits'];
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (!recordId.test(id) || ids.has(id)) return false;
    ids.add(id); return true;
  };
  for (const m of doc.missions) {
    if (!unique(m.id) || !safeText(m.title, 120) || !safeText(m.objective, 2048) || !safeText(m.encounterName, 128) || !triggerValues.has(m.trigger) ||
      (m.triggerRef !== undefined && m.triggerRef !== '' && !scriptIdent.test(m.triggerRef)) ||
      (m.timerSeconds !== undefined && (!Number.isInteger(m.timerSeconds) || m.timerSeconds<0 || m.timerSeconds>600)))
      failures.push(`Invalid mission beat ${m.id?.slice(0, 40) ?? '(unknown)'}`);
  }
  for (const shot of doc.shots) {
    if (!unique(shot.id) || !safeText(shot.name, 120) || !safeText(shot.subtitle, 2048) ||
      !Number.isInteger(shot.durationMs) || shot.durationMs < 100 || shot.durationMs > 600000 ||
      !Number.isFinite(shot.fov) || shot.fov < 10 || shot.fov > 140 ||
      !boundedPos(shot.cameraPosition) || !boundedPos(shot.lookAt) ||
      (shot.cameraMarker !== undefined && shot.cameraMarker !== '' && !scriptIdent.test(shot.cameraMarker))) failures.push(`Invalid camera shot ${shot.id?.slice(0, 40) ?? '(unknown)'}`);
  }
  const s = doc.server;
  if (!safeText(s.name, 63) || !s.name.trim() || s.name.includes('"') || s.name.includes('\\') || !runtimes.has(s.runtime) ||
    !Number.isInteger(s.maxPlayers) || s.maxPlayers < 1 || s.maxPlayers > 16 || typeof s.publicListing !== 'boolean')
    failures.push('Invalid server profile');
  if (s.gameTypes !== undefined) {
    if (!Array.isArray(s.gameTypes) || s.gameTypes.length > 64) return ['Game type collection exceeds 64 entries'];
    const seen = new Set<string>();
    for (const type of s.gameTypes) {
      if (!type || typeof type !== 'object') { failures.push('Invalid custom game type record'); continue; }
      const safeName = typeof type.name === 'string' && variantToken.test(type.name) && !!type.name.trim();
      const safeEvidence = typeof type.nativeEvidence === 'string' && type.nativeEvidence.length <= 180 && !/[\x00-\x1f\x7f<>]/.test(type.nativeEvidence);
      const safeNotes = typeof type.notes === 'string' && type.notes.length <= 1000 && !/[\x00-\x1f\x7f]/.test(type.notes);
      if (!unique(type.id) || !safeName || seen.has(type.name.toLowerCase()) ||
        !['slayer','ctf','oddball','king','race','juggernaut','assault'].includes(type.baseVariant) ||
        typeof type.teamPlay !== 'boolean' || typeof type.friendlyFire !== 'boolean' ||
        !Number.isInteger(type.scoreLimit) || type.scoreLimit < 0 || type.scoreLimit > 1000 ||
        !Number.isInteger(type.timeLimitMinutes) || type.timeLimitMinutes < 0 || type.timeLimitMinutes > 180 ||
        !Number.isInteger(type.respawnSeconds) || type.respawnSeconds < 0 || type.respawnSeconds > 120 ||
        !['mapDefault','rockets','snipers','custom'].includes(type.startingEquipment) ||
        !['standard','infectionConcept','firefightConcept'].includes(type.specialRules) ||
        !['draft','userConfirmedInGame'].includes(type.nativeStatus) || !safeEvidence || !safeNotes ||
        (type.nativeStatus === 'userConfirmedInGame' && !type.nativeEvidence.trim()))
        failures.push(`Invalid custom game type ${String(type.id).slice(0,40)}`);
      if (safeName) seen.add(type.name.toLowerCase());
    }
  }
  for (const entry of s.rotation) {
    if (!unique(entry.id) || !commandToken.test(entry.map) || !variantToken.test(entry.gameVariant) || !entry.gameVariant.trim())
      failures.push(`Unsafe map/variant entry ${entry.id?.slice(0,40) ?? '(unknown)'}`);
  }
  for (const record of doc.playtests) {
    if (!unique(record.id) || !safeText(record.caseId, 120) || !record.caseId.trim() || !safeText(record.target, 120) ||
      !safeText(record.performedAt, 50) || !safeText(record.evidence, 2048) || !safeText(record.notes, 4096) ||
      !verdicts.has(record.verdict) || typeof record.manuallyReported !== 'boolean' ||
      (record.verdict === 'pass' && (!record.manuallyReported || !record.evidence.trim())))
      failures.push(`Invalid test record ${record.id?.slice(0,40) ?? '(unknown)'}`);
  }
  return failures;
}
/** Halo Custom Edition / stock CE server only. No passwords or admin tokens. */
export function exportHaloCeServerInit(studio: CreatorStudioDocument): string {
  const errors = validateCreatorStudio(studio);
  if (errors.length) throw new Error(`Unsafe server profile: ${errors.join('; ')}`);
  const server = studio.server;
  if (server.runtime !== 'haloCustomEdition') throw new Error('This runtime has no verified dedicated-server init.txt exporter.');
  if (!server.rotation.length) throw new Error('Add and verify at least one installed map and variant.');
  // A non-stock name is not a binary game type. Only accept a user-confirmed
  // game-created variant. Stock server init does not implement scripted Zombies.
  const known = new Set(['slayer','team slayer','ctf','assault','oddball','team oddball',
    'juggernaut','king','crazy king','race','team race','classic_rockets','classic_snipers']);
  for (const entry of server.rotation) {
    if (known.has(entry.gameVariant.trim().toLowerCase())) continue;
    const custom=(server.gameTypes??[]).find(type => type.name.trim().toLowerCase()===entry.gameVariant.trim().toLowerCase());
    if (!custom || custom.nativeStatus !== 'userConfirmedInGame' || !custom.nativeEvidence.trim() || custom.specialRules !== 'standard')
      throw new Error(`Custom game type '${entry.gameVariant}' is not ready. Save a matching native game type in Halo CE and declare its source; scripted infection/AI is not supported.`);
  }
  return [
    '// Guilty Spark: REVIEW BEFORE USE. No server/network changes performed.',
    '// Halo Custom Edition stock dedicated server; no SAPP or MCC syntax assumed.',
    '// Map names and variants must exist on the target installation.',
    '// No password or RCON secret is stored or exported.',
    `sv_name "${server.name}"`,
    `sv_maxplayers ${server.maxPlayers}`,
    `sv_public ${server.publicListing ? 1 : 0}`,
    ...server.rotation.map(entry => {
      const variant = entry.gameVariant.trim();
      return `sv_mapcycle_add ${entry.map} ${variant.includes(' ') ? `"${variant}"` : variant}`;
    }),
    'sv_mapcycle_begin',
    '',
  ].join('\r\n');
}
export function exportStudioEvidence(
  studio: CreatorStudioDocument, project: { id: string; title: string; source: { sha256: string } | null }, createdAt = new Date().toISOString(),
): string {
  const errors = validateCreatorStudio(studio);
  if (errors.length) throw new Error(errors.join('; '));
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'guilty-spark-authoring-and-manual-qa',
    createdAt,
    project: { id: project.id, title: project.title, sourceSha256: project.source?.sha256 ?? null },
    mission: { beats: studio.missions, status: 'authoredNotCompiled' },
    cinematic: { shots: studio.shots, status: 'authoredNotCompiled' },
    server: { runtime: studio.server.runtime, name: studio.server.name, maxPlayers: studio.server.maxPlayers,
      publicListing: studio.server.publicListing, rotation: studio.server.rotation, gameTypes: studio.server.gameTypes??[], status: 'draftNotDeployed' },
    playtests: studio.playtests,
    liveGameVerifiedAutomatically: false,
    reminder: 'Manual verdicts are user reports only. Save screenshots/logs and test exact runtime/build independently.',
  }, null, 2);
}
