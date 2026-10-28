import { historyReducer, initialHistory } from './editor';
import type { HistoryAction, HistoryState } from './editor';
import type { MapInspection, MeshData, OpenProject, Project } from './types';
export interface MapDocument {
  id: string;
  history: HistoryState;
  inspection: MapInspection | null;
  meshes: Record<string, MeshData>;
}
export interface MapDocuments {
  activeId: string | null;
  documents: MapDocument[];
  limit: number;
}
export type DocumentAction =
  | { type: 'open'; open: OpenProject }
  | { type: 'resources'; project: Project }
  | { type: 'select'; id: string }
  | { type: 'close'; id: string }
  | { type: 'history'; action: HistoryAction; id?: string }
  | { type: 'mesh'; id: string; assetId: string; mesh: MeshData }
  | { type: 'saved'; id: string; project: Project };
export function emptyMapDocuments(limit: number): MapDocuments {
  return { activeId: null, documents: [], limit };
}
export function activeDocument(state: MapDocuments): MapDocument | undefined {
  return state.documents.find((d) => d.id === state.activeId);
}
export function documentReducer(state: MapDocuments, action: DocumentAction): MapDocuments {
  if(action.type==='resources'){
    const source=action.project.source;
    if(!source)return state;
    const merge=(p:Project)=>p.source?.sha256===source.sha256?{...p,source:{...p.source,resourceDirectory:source.resourceDirectory,resourceSha256:source.resourceSha256}}:p;
    return {...state,documents:state.documents.map(d=>d.id!==action.project.id?d:{...d,history:{...d.history,current:d.history.current?merge(d.history.current):null,past:d.history.past.map(merge),future:d.history.future.map(merge)}})};
  }
  if (action.type === 'open') {
    const id = action.open.project.id,
      old = state.documents.find((d) => d.id === id);
    const doc = {
      id,
      inspection: action.open.inspection,
      meshes: old?.meshes ?? {},
      history: historyReducer(
        { ...initialHistory, limit: state.limit },
        { type: 'load', project: action.open.project },
      ),
    };
    return {
      ...state,
      activeId: id,
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
      if (action.type === 'mesh') return { ...d, meshes: { ...d.meshes, [action.assetId]: action.mesh } };
      if (action.type === 'saved')
        return d.history.current === action.project
          ? { ...d, history: historyReducer(d.history, { type: 'saved' }) }
          : d;
      return { ...d, history: historyReducer(d.history, action.action) };
    }),
  };
}
