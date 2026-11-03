import {COMPATIBILITY_REVISION,RUNTIME_COMPATIBILITY} from '../runtimeCompatibility';
export default function CompatibilityTable(){return <details className="analysis-card gs-compatibility"><summary>Engine compatibility table · {COMPATIBILITY_REVISION}</summary>
  <p>Map binaries are engine-specific. File inspection, compilation, game loading and multiplayer are separate evidence gates. The supported editor subset is narrower than each game’s full feature set.</p>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Runtime</th><th>Map format</th><th>Tags & scripts</th><th>Builders</th><th>Resources</th><th>Shaders & lightmaps</th><th>Runtime evidence</th></tr></thead><tbody>{RUNTIME_COMPATIBILITY.map(r=><tr key={r.name}><th>{r.name}</th><td>{r.maps}</td><td>{r.tags}</td><td>{r.builder}</td><td>{r.resources}</td><td>{r.render}</td><td>{r.play}</td></tr>)}</tbody></table></div>
  <p>Per-map native format and available routes are in Project setup → Source identity. Pinned source research and separate read/render/build/gameplay gates are recorded in the C58 compatibility report. These summaries grant no additional runtime operations.</p>
</details>}
