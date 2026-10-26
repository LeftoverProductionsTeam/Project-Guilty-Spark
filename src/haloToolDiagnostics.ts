/** Classifies local, user-selected Halo 1 Tool output. Never executes a command.
 * This maps *known* compiler messages to conservative troubleshooting steps,
 * and never claims a BSP has compiled or loaded solely because no error matched.
 */
export interface ToolDiagnostic {
  line: number;
  level: 'error' | 'warning';
  code: string;
  message: string;
  action: string;
  wrlUseful: boolean;
}
export interface ToolLogReview {
  diagnostics: ToolDiagnostic[];
  unclassified: number;
  containsFatal: boolean;
  textLines: number;
  note: string;
}
const known: { id: string; pattern: RegExp; action: string; wrl: boolean }[] = [
  {id:'BSP_DEPTH',pattern:/global_plane_count\s*<\s*MAXIMUM_BSP3D_DEPTH|couldn.t build leaf map/i,action:'Collision BSP partitioning may exceed engine depth. Simplify dense geometry and complex curved collision; do not bypass compiler assertions.',wrl:false},
  {id:'EMPTY_COLLISION',pattern:/collision bsp is empty/i,action:'This JMS has no collidable geometry. Verify at least one sealed, collision-enabled source shell instead of only render-only (!) surfaces.',wrl:false},
  {id:'BSP_DIVIDING_EDGE',pattern:/dividing_edge->vertex_indices\[1\]\s*==\s*NONE/i,action:'Investigate near-coplanar or rounding-unstable collision source around the affected area. Recheck JMS scale; no automatic binary fix is safe.',wrl:false},
  {id:'BSP_TOO_SMALL',pattern:/not a valid structure_bsp_cluster_block index/i,action:'Examine tiny or degenerate level scale and overlapping source faces. Rebuild in an isolated staging location after repairing geometry.',wrl:false},
  {id:'PHANTOM_COLLISION',pattern:/\bphantom bsp\b/i,action:'Validate collision in a running game and rebuild source collision if phantom surfaces remain. A Tool option is not a guarantee of a fix.',wrl:false},
  {id:'OPEN_EDGE', pattern:/\bopen edge\b|\bedge is open\b/i, action:'Seal the affected collision shell or use an appropriate render-only Halo material. Inspect red edges in Tool WRL.',wrl:true},
  {id:'NON_MANIFOLD', pattern:/\bcouldn.t update edge\b|\bmore than 2 faces\b/i, action:'Check edges shared by three faces, reversed normals and nearly coincident geometry. Use the WRL overlay.',wrl:true},
  {id:'INTERSECTING_FACES', pattern:/\bz-buffered triangle\b|\bintersecting surfaces?\b/i,action:'Rebuild overlapping collision polygons as connected, nonintersecting source topology. A visual snap is not a CSG union.',wrl:true},
  {id:'RADIOSITY_UVS',pattern:/\bdegenerate triangle or triangle with bad uvs\b/i,action:'Check degenerate lightmap UVs, particularly materials using simple parameterization; re-unwrap the affected source faces.',wrl:true},
  {id:'DEGENERATE',pattern:/\bdegenerate triangles?\b|\bzero.area\b/i,action:'Locate collapsed or tiny triangles and remove/retriangulate them before JMS export.',wrl:true},
  {id:'COPLANAR',pattern:/\bnearly coplanar\b/i,action:'Make surfaces truly coplanar or separate them; Tool may fail during collision/portal generation.',wrl:true},
  {id:'PORTAL',pattern:/\bportal.*(?:closed spaces|outside the bsp|divid|edge|leak|unearthed)\b/i,action:'Verify portal planes divide exactly two sealed spaces, have no exposed edges and are connected to the BSP.',wrl:true},
  {id:'COLLISION',pattern:/\b(?:failed|could not|couldn.t) (?:to )?(?:import|build) collision\b/i,action:'Investigate the earlier geometry errors, then rebuild collision with the matching Tool. This is often a downstream failure.',wrl:true},
  {id:'JMS_VERSION',pattern:/\bwrong version number\b/i,action:'Regenerate JMS with Halo 1 version 8200 settings, not a later Halo game.',wrl:false},
  {id:'JMS_TRUNCATED',pattern:/\breached end of file during parse\b/i,action:'JMS may be truncated. Re-export to isolated source output and verify the exported file size/hash.',wrl:false},
  {id:'TAG_TRUNCATED',pattern:/\bcouldn.t read .*bytes from offset\b|\bcouldn.t read elements\b/i,action:'An existing BSP tag may be incomplete. Preserve and back up original tags; rebuild in an isolated worktree without overwriting live maps.',wrl:false},
  {id:'PVS',pattern:/\breimported for new, faster visibility\b/i,action:'Inspect invalid/floating visibility clusters and portals; do not interpret this as an instruction to blindly overwrite a BSP.',wrl:false},
  {id:'T_JUNCTION',pattern:/\bfound possible t.junction\b/i,action:'Inspect narrow faces and tiny edges around the WRL warning. Solve other geometry defects first, then rebuild.',wrl:true},
  {id:'BSP_OVERLAP',pattern:/\bcouldn.t build bsp because of overlapping surfaces\b/i,action:'Two collidable surfaces overlap. Remove coplanar duplicate faces or rebuild their topology; do not treat touching brushes as a boolean union.',wrl:true},
  {id:'VERTEX_BOUNDS',pattern:/\bvertex has a bad point\b/i,action:'A vertex may be farther than the Halo 1 BSP limit from the origin. Check scale and coordinates in the original source.',wrl:false},
  {id:'PORTAL_DUPLICATE',pattern:/\bfound duplicate triangle building connected geometry\b/i,action:'Check duplicate portal faces in the WRL and remove duplicates from authored portal source, not a compiled map.',wrl:true},
  {id:'CLUSTER_COMPLEXITY',pattern:/\bcouldn.t allocate subcluster\b/i,action:'A cluster may exceed the triangle budget. Simplify collision geometry or redesign portal/cluster divisions.',wrl:false},
  {id:'SKY_CLUSTER',pattern:/\bcluster can see multiple skies\b/i,action:'Use a single sky within visible connected clusters or redesign sealed cluster separation.',wrl:false},
  {id:'PORTAL_UNEARTHED',pattern:/\bunearthed edge\b/i,action:'Seal the portal edge against BSP geometry or connect the portal to other portal vertices.',wrl:true},
];
export function analyzeHaloToolLog(input: string): ToolLogReview {
  if (typeof input !== 'string' || input.length > 512*1024 || !input.trim()) throw new Error('Tool log must be nonempty and smaller than 512 KiB');
  if (input.includes('\0')) throw new Error('Binary data is not a supported Halo Tool text log');
  const lines=input.split(/\r?\n/);
  if (lines.length>12000) throw new Error('Tool log has too many lines');
  const diagnostics:ToolDiagnostic[]=[];
  let unclassified=0, unclassifiedErrors=0;
  lines.forEach((line,index)=>{
    const isError=/\b(?:###\s*)?(?:error|exception|fatal)\b/i.test(line);
    const isWarning=/\bwarning\b/i.test(line);
    const item=known.find(k=>k.pattern.test(line));
    if (!item && (isError || isWarning)) {unclassified++;if(isError)unclassifiedErrors++;}
    if (!item) return;
    if (diagnostics.length>=256) throw new Error('Tool log contains too many diagnostics');
    diagnostics.push({line:index+1,level:isError?'error':'warning',code:item.id,
      message:line.trim().slice(0,500),action:item.action,wrlUseful:item.wrl});
  });
  return {diagnostics,unclassified,containsFatal:diagnostics.some(d=>d.level==='error')||unclassifiedErrors>0,
    textLines:lines.length,
    note:'This is a partial log classifier, not a success detector. A zero-issue report does not prove BSP compilation, collision, lightmaps or Halo gameplay.',
  };
}
