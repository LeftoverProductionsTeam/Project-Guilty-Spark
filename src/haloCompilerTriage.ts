/**
 * Compiler-attempt triage for an author-selected Halo 1 Tool log and/or WRL.
 *
 * This is NOT compiler attestation: file-to-source association is asserted by
 * the author when loading each diagnostic. Raw logs may include private local
 * paths; WRL positions may expose original geometry. Neither is exported here.
 * The report is deliberately source-only, deterministic, small and read-only.
 */
import type { SourcePreflight } from './sourcePreflight.ts';
import type { ToolLogReview } from './haloToolDiagnostics.ts';
import type { WrlDiagnostics } from './haloWrl.ts';
import type { WrlBrushAssociation } from './haloWrlSourceMatch.ts';

const HASH = /^[a-f0-9]{64}$/i;
const CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

export type TriageStatus = 'source-export-blocked' | 'compiler-errors-observed' | 'diagnostics-need-review';
export interface CompilerTriageInputs {
  sourceSha256: string;
  preflight: SourcePreflight;
  toolLog: ToolLogReview | null;
  toolLogLoadedSourceHash: string | null;
  wrl: WrlDiagnostics | null;
  wrlLoadedSourceHash: string | null;
  brushAssociation?: WrlBrushAssociation | null;
}
export interface CompilerTriageReport {
  schema: 'guiltyspark-halo1-compiler-triage/v1';
  scope: 'local-user-associated-diagnostics-only';
  sourceSha256: string;
  sourceExportPermitted: boolean;
  source: { triangles: number; blockers: number; warnings: number; tJunctionScanComplete: boolean | null };
  toolLog: {
    imported: boolean;
    lines: number;
    knownMessages: number;
    unclassifiedMessages: number;
    containsFatal: boolean;
    codes: { code: string; errors: number; warnings: number; firstLine: number }[];
    otherKnownCodes: number;
  };
  wrl: {
    imported: boolean;
    regions: number;
    errorEdges: number;
    errorFaces: number;
    coordinateScale: number | null;
    sampledPrimitives: number;
    ambiguousSamples: number;
    unmatchedSamples: number;
    candidateBrushes: number;
  };
  status: TriageStatus;
  nextActions: string[];
  sourceIdentity: 'user-asserted-not-cryptographically-linked-to-tool-job';
  toolExecutionVerified: false;
  compiledBspVerified: false;
  collisionVerified: false;
  portalsVerified: false;
  gameplayVerified: false;
  privacy: string;
}
function requireHash(value: string, label: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`Invalid ${label} SHA-256`);
  return value.toLowerCase();
}
const integer = (value: number, max: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= max;

export function makeCompilerTriageReport(input: CompilerTriageInputs): CompilerTriageReport {
  if (!input || !input.preflight || !input.preflight.sameDocument)
    throw new Error('Wait for the current QuickForge source validation before exporting compiler evidence');
  const sourceHash = requireHash(input.sourceSha256, 'current source');
  const { preflight, toolLog, wrl, brushAssociation } = input;
  if (!integer(preflight.triangles, 32000) || !Array.isArray(preflight.blockers) ||
      !Array.isArray(preflight.warnings) || preflight.blockers.length > 1000 || preflight.warnings.length > 1000 ||
      typeof preflight.ready !== 'boolean' || preflight.ready !== (preflight.blockers.length === 0))
    throw new Error('Malformed or stale source validation');
  if (!toolLog && !wrl) throw new Error('Import a current Halo Tool text log or WRL before exporting a compiler triage report');
  if (toolLog && requireHash(input.toolLogLoadedSourceHash ?? '', 'Tool log association') !== sourceHash)
    throw new Error('Imported Tool log belongs to a different or unverified source revision; reimport it');
  if (wrl && requireHash(input.wrlLoadedSourceHash ?? '', 'WRL association') !== sourceHash)
    throw new Error('Imported WRL belongs to a different or unverified source revision; reimport it');
  if (brushAssociation && !wrl) throw new Error('Source brush hints require the matching WRL');

  const codes = new Map<string, {code:string;errors:number;warnings:number;firstLine:number}>();
  let lines = 0, knownMessages = 0, unclassifiedMessages = 0, containsFatal = false;
  if (toolLog) {
    if (!integer(toolLog.textLines, 12000) || toolLog.textLines < 1 ||
        !Array.isArray(toolLog.diagnostics) || toolLog.diagnostics.length > 256 ||
        !integer(toolLog.unclassified, 12000) || typeof toolLog.containsFatal !== 'boolean')
      throw new Error('Malformed Tool log review');
    lines = toolLog.textLines; knownMessages = toolLog.diagnostics.length;
    unclassifiedMessages = toolLog.unclassified; containsFatal = toolLog.containsFatal;
    for (const item of toolLog.diagnostics) {
      if (!item || typeof item.code !== 'string' || !CODE.test(item.code) ||
          !integer(item.line, lines) || item.line < 1 || !['error','warning'].includes(item.level))
        throw new Error('Malformed Tool diagnostic code or line number');
      const current = codes.get(item.code) ?? {code:item.code,errors:0,warnings:0,firstLine:item.line};
      current[item.level === 'error' ? 'errors' : 'warnings']++;
      current.firstLine=Math.min(current.firstLine,item.line);
      codes.set(item.code,current);
    }
    if (toolLog.diagnostics.some(d=>d.level==='error') && !containsFatal)
      throw new Error('Tool log fatal-status counters disagree');
  }
  const ordered = [...codes.values()].sort((a,b)=>b.errors-a.errors || a.firstLine-b.firstLine || a.code.localeCompare(b.code));
  let regions=0,edges=0,faces=0,scale:null|number=null;
  if (wrl) {
    if (!integer(wrl.regions,256) || wrl.regions<1 ||
        !Array.isArray(wrl.segments) || !Array.isArray(wrl.faces) ||
        wrl.segments.length+wrl.faces.length<1 || wrl.segments.length+wrl.faces.length>75000 ||
        ![.01,1].includes(wrl.coordinateScale)) throw new Error('Malformed parsed Halo 1 WRL');
    regions=wrl.regions;edges=wrl.segments.length;faces=wrl.faces.length;scale=wrl.coordinateScale;
  }
  if (brushAssociation && (
      !integer(brushAssociation.sampledPrimitives,192) ||
      !integer(brushAssociation.totalPrimitives,75000) ||
      brushAssociation.totalPrimitives!==edges+faces ||
      !integer(brushAssociation.ambiguousPrimitives,192) ||
      !integer(brushAssociation.unmatchedPrimitives,192) ||
      !Array.isArray(brushAssociation.candidates) || brushAssociation.candidates.length>10 ||
      brushAssociation.ambiguousPrimitives+brushAssociation.unmatchedPrimitives>brushAssociation.sampledPrimitives))
    throw new Error('Malformed WRL source-brush association');

  const status:TriageStatus = preflight.blockers.length ? 'source-export-blocked' :
    containsFatal ? 'compiler-errors-observed' : 'diagnostics-need-review';
  const nextActions:string[]=[];
  if (preflight.blockers.length) nextActions.push('Repair the current source-export blockers before another isolated structure attempt.');
  if (containsFatal) nextActions.push('Investigate the first genuine compiler error in the original Tool log; later geometry failures may be downstream symptoms.');
  const geometryCodes=['OPEN_EDGE','NON_MANIFOLD','INTERSECTING_FACES','DEGENERATE','COPLANAR','T_JUNCTION','BSP_OVERLAP','VERTEX_BOUNDS'];
  if (ordered.some(c=>geometryCodes.includes(c.code))) nextActions.push('Inspect the marked source shell, face winding and intersecting geometry; compare matching WRL color/region diagnostics.');
  if (ordered.some(c=>['PORTAL','PORTAL_UNEARTHED','PORTAL_DUPLICATE','PVS','SKY_CLUSTER'].includes(c.code)))
    nextActions.push('Check portal material rules and connected visibility clusters with the matching Halo 1 Tool; do not infer PVS validity from the preview.');
  if (unclassifiedMessages) nextActions.push('Read the unclassified warning/error lines in your ORIGINAL local log; this export intentionally omits raw text.');
  if (wrl) nextActions.push('Review user-associated WRL errors against the current source; all brush associations are proximity hints, not verified compiler attribution.');
  if (!nextActions.length) nextActions.push('No failure was proven by these files. Run Tool and verify its actual exit status, tag output, cache identity and in-engine behavior.');
  return {
    schema:'guiltyspark-halo1-compiler-triage/v1',
    scope:'local-user-associated-diagnostics-only',sourceSha256:sourceHash,
    sourceExportPermitted:preflight.ready,
    source:{triangles:preflight.triangles,blockers:preflight.blockers.length,warnings:preflight.warnings.length,
      tJunctionScanComplete:preflight.meshIntegrity?.tJunctionScanComplete ?? null},
    toolLog:{imported:!!toolLog,lines,knownMessages,unclassifiedMessages,containsFatal,
      codes:ordered.slice(0,24),otherKnownCodes:Math.max(0,ordered.length-24)},
    wrl:{imported:!!wrl,regions,errorEdges:edges,errorFaces:faces,coordinateScale:scale,
      sampledPrimitives:brushAssociation?.sampledPrimitives ?? 0,
      ambiguousSamples:brushAssociation?.ambiguousPrimitives ?? 0,
      unmatchedSamples:brushAssociation?.unmatchedPrimitives ?? 0,
      candidateBrushes:brushAssociation?.candidates.length ?? 0},
    status,nextActions:nextActions.slice(0,6),
    sourceIdentity:'user-asserted-not-cryptographically-linked-to-tool-job',
    toolExecutionVerified:false,compiledBspVerified:false,collisionVerified:false,portalsVerified:false,gameplayVerified:false,
    privacy:'Contains only bounded counts, classifier codes, actions and current source hash. No raw compiler lines, local file paths, VRML coordinates, tag paths, source geometry, map bytes or game assets.',
  };
}
