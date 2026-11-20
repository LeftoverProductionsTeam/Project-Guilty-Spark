import { historyReducer, initialHistory } from './editor';
import type { HistoryAction, HistoryState } from './editor';
import type { Asset, MapInspection, MeshData, OpenProject, Project } from './types';
import { hasSourceBoundEdits } from './externalMapSync';
export interface MapDocument {
  id: string;
  history: HistoryState;
  inspection: MapInspection | null;
  meshes: Record<string, MeshData>;
  /** Saved native metadata invalidates only this document's tool reports. */
  savedRevision?: number;
}
export interface MapDocuments {
  activeId: string | null;
  documents: MapDocument[];
  limit: number;
}
export type DocumentAction =
  | { type:'window-history';id:string;history:HistoryState }
  | { type: 'open'; open: OpenProject; activate?: boolean }
  | { type: 'external-revision'; previousId: string; open: OpenProject; replaceClean: boolean }
  | { type: 'resources'; project: Project; inspection?:MapInspection|null; kind?:'audio' }
  | { type: 'select'; id: string }
  | { type:'reorder';ids:string[] }
  | { type: 'close'; id: string }
  | { type: 'history'; action: HistoryAction; id?: string }
  | ({ type: 'mesh'; id: string; mesh: MeshData } & AssetMeshScope)
  | { type: 'saved'; id: string; project: Project };
type AssetMeshScope = { assetId: string; assetSha256: string; sourceSha256: string | null };

export function assetMeshScope(project: Project, asset: Asset): AssetMeshScope {
  return {assetId:asset.id, assetSha256:asset.sha256, sourceSha256:project.source?.sha256??null};
}

export function matchesAssetMesh(project: Project | null | undefined, scope: AssetMeshScope): boolean {
  return !!project && (project.source?.sha256??null) === scope.sourceSha256 &&
    project.assets.some(asset=>asset.kind==='obj' && asset.id===scope.assetId && asset.sha256===scope.assetSha256);
}

function retainedMeshes(document: MapDocument, project: Project | null): MapDocument['meshes'] {
  const previous = document.history.current;
  if (previous === project) return document.meshes;
  if (!previous || !project || (previous.source?.sha256??null) !== (project.source?.sha256??null)) return {};
  if (previous.assets === project.assets) return document.meshes;
  const assets = new Map(project.assets.filter(asset=>asset.kind==='obj').map(asset=>[asset.id, asset.sha256]));
  const meshes = Object.fromEntries(previous.assets
    .filter(asset=>asset.kind==='obj' && asset.sha256===assets.get(asset.id) && Object.hasOwn(document.meshes,asset.id))
    .map(asset=>[asset.id, document.meshes[asset.id]]));
  return Object.keys(meshes).length === Object.keys(document.meshes).length ? document.meshes : meshes;
}

function withHistory(document: MapDocument, history: HistoryState): MapDocument {
  return {...document, history, meshes:retainedMeshes(document, history.current)};
}

export function emptyMapDocuments(limit: number): MapDocuments {
  return { activeId: null, documents: [], limit };
}
export function activeDocument(state: MapDocuments): MapDocument | undefined {
  return state.documents.find((d) => d.id === state.activeId);
}
function inspectionUnchanged(previous:MapInspection|null|undefined,incoming:MapInspection|null|undefined,oldSource:Project['source'],source:Project['source']) {
  return !!previous&&!!incoming&&!!oldSource&&!!source&&oldSource.sha256===source.sha256&&
    previous.sha256===source.sha256&&incoming.sha256===source.sha256&&typeof previous.header?.version==='number'&&previous.header.version===incoming.header?.version&&
    JSON.stringify([oldSource.resourceDirectory,oldSource.resourceSha256,oldSource.audioResources,previous.diagnostics,previous.resources])===
    JSON.stringify([source.resourceDirectory,source.resourceSha256,source.audioResources,incoming.diagnostics,incoming.resources]);
}
export function documentReducer(state: MapDocuments, action: DocumentAction): MapDocuments {
  if(action.type==='reorder'){
    if(action.ids.length!==state.documents.length||new Set(action.ids).size!==action.ids.length||action.ids.some(id=>!state.documents.some(d=>d.id===id)))return state;
    if(action.ids.every((id,index)=>state.documents[index].id===id))return state;
    return {...state,documents:action.ids.map(id=>state.documents.find(d=>d.id===id)!)};
  }
  if(action.type==='window-history')return {...state,documents:state.documents.map(d=>d.id===action.id&&action.history.current?.id===d.id?withHistory(d,action.history):d)};
  if (action.type === 'external-revision') {
    const previous = state.documents.find(document => document.id === action.previousId);
    if (!previous || !previous.history.current) return state;
    const incoming = action.open.project, current = previous.history.current;
    if (!incoming.source || !action.open.inspection || incoming.source.sha256 !== action.open.inspection.sha256 || incoming.id === previous.id) return state;
    const existing = state.documents.find(document => document.id === incoming.id);
    const matching = current.source?.cacheVersion === incoming.source.cacheVersion && current.source.scenarioPath.replaceAll('\\','/').toLowerCase() === incoming.source.scenarioPath.replaceAll('\\','/').toLowerCase();
    const replace = action.replaceClean && matching && !previous.history.dirty && !hasSourceBoundEdits(current, previous.inspection) && !hasSourceBoundEdits(incoming, action.open.inspection);
    const next = existing ?? {id: incoming.id, inspection: action.open.inspection, meshes: {}, history: historyReducer({...initialHistory, limit: state.limit}, {type:'load',project:incoming})};
    let documents = replace ? state.documents.filter(document => document.id !== previous.id) : state.documents;
    if (!existing) documents = replace ? state.documents.flatMap(document => document.id === previous.id ? [next] : [document]) : [...documents, next];
    return {...state, documents, activeId: state.activeId === previous.id ? incoming.id : state.activeId};
  }
  if(action.type==='resources'){
    const source=action.project.source;
    if(!source)return state;
    const merge=(p:Project)=>p.source?.sha256===source.sha256?{...p,source:{...p.source,...(action.kind==='audio'?{}:{resourceDirectory:source.resourceDirectory,resourceSha256:source.resourceSha256}),...(source.audioResources===undefined?{}:{audioResources:source.audioResources})}}:p;
    return {...state,documents:state.documents.map(d=>d.id!==action.project.id?d:{...d,inspection:d.history.current?.source?.sha256===source.sha256&&action.inspection?.sha256===source.sha256&&!inspectionUnchanged(d.inspection,action.inspection,d.history.current.source,source)?action.inspection:d.inspection,history:{...d.history,current:d.history.current?merge(d.history.current):null,past:d.history.past.map(merge),future:d.history.future.map(merge)}})};
  }
  if (action.type === 'open') {
    const id = action.open.project.id,
      old = state.documents.find((d) => d.id === id);
    const sameSource=inspectionUnchanged(old?.inspection,action.open.inspection,old?.history.current?.source??null,action.open.project.source);
    const doc = {
      id,
      // Native open has already revalidated the preserved source. Reuse its
      // immutable decoded buffers only when source AND resource identities
      // agree, so retained editors do not decode/reupload them on tab return.
      inspection: sameSource ? old!.inspection : action.open.inspection,
      meshes: old ? retainedMeshes(old, action.open.project) : {},
      history: historyReducer(
        { ...initialHistory, limit: state.limit },
        { type: 'load', project: action.open.project },
      ),
    };
    return {
      ...state,
      activeId: action.activate === false && state.activeId ? state.activeId : id,
      documents: old ? state.documents.map((d) => (d.id === id ? doc : d)) : [...state.documents, doc],
    };
  }
  if (action.type === 'select')
    return state.documents.some((d) => d.id === action.id) ? { ...state, activeId: action.id } : state;
  if (action.type === 'close') {
    const index = state.documents.findIndex((d) => d.id === action.id);
    if (index < 0) return state;
    const documents = state.documents.filter((d) => d.id !== action.id);
    return {
      ...state,
      documents,
      activeId:
        state.activeId === action.id
          ? (documents[Math.min(index, documents.length - 1)]?.id ?? null)
          : state.activeId,
    };
  }
  if (action.type === 'history' && action.action.type === 'history-limit') {
    const test = historyReducer({ ...initialHistory, limit: state.limit }, action.action);
    return {
      ...state,
      limit: test.limit,
      documents: state.documents.map((d) => ({ ...d, history: historyReducer(d.history, action.action) })),
    };
  }
  const id =
    action.type === 'history'
      ? (action.id ??
        ('project' in action.action
          ? action.action.project.id
          : 'projectId' in action.action
            ? action.action.projectId
            : state.activeId))
      : action.id;
  return {
    ...state,
    documents: state.documents.map((d) => {
      if (d.id !== id) return d;
      if (action.type === 'mesh') return matchesAssetMesh(d.history.current, action)
        ? { ...d, meshes: { ...d.meshes, [action.assetId]: action.mesh } }
        : d;
      if (action.type === 'saved')
        return { ...withHistory(d, historyReducer(d.history, { type: 'saved', project: action.project })),
          savedRevision: (d.savedRevision ?? 0) + 1 };
      if (action.action.type === 'assets' &&
          (action.action.project.source?.sha256??null) !== (d.history.current?.source?.sha256??null)) return d;
      return withHistory(d, historyReducer(d.history, action.action));
    }),
  };
}
