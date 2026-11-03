import {call,native} from './api';
import type {OpenProject} from './types';

/** Resolve pixels for the actual source format, independently of the selected
 * hosting runtime. No result cache: native hashes/pins remain authoritative. */
export async function openMapPreviewSource(id:string):Promise<OpenProject> {
  const initial=await call<OpenProject>('open_project',{id});
  let connected:OpenProject|null=null;
  if(native && initial.inspection?.header.version===13 && !initial.project.source?.resourceSha256?.['mcc-textures']) {
    try {connected=await call<OpenProject>('connect_mcc_texture_resources',{projectId:id});}
    catch {/* Embedded source images remain usable; unavailable pixels stay explicit. */}
  } else if(native && [6,7,609].includes(initial.inspection?.header.version??0)) {
    try {connected=await call<OpenProject|null>('auto_connect_classic_textures',{projectId:id});}
    catch {/* An unavailable resource or another window's ownership is not a replacement image. */}
  }
  if(connected && (connected.project.id!==initial.project.id || connected.project.source?.sha256!==initial.project.source?.sha256))
    throw Error('Preview resources do not belong to the requested preserved map');
  return connected??initial;
}
