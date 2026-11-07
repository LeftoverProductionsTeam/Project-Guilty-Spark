import type { BspTool } from '../bspWorkshop';

export default function BspWorkshopGuide({
  draw,
  rename,
  objects,
  build,
}: {
  draw: (tool: BspTool) => void;
  rename: () => void;
  objects: () => void;
  build: () => void;
}) {
  return (
    <details className="bsp-workflow-guide">
      <summary>Build the demos · step by step</summary>
      <ol>
        <li>
          <b>Rooms, corridor and ramp</b>
          <p>
            Use Shapes to drop a room, box, wall, ramp or stairs into any view, or choose a drawing tool and drag its footprint in Top view. Overlap the
            corridor into both rooms; place the ramp inside a room.
          </p>
          <div className="bsp-inline">
            <button onClick={() => draw('drawSpace')}>Draw room</button>
            <button onClick={() => draw('drawPassage')}>Draw corridor</button>
            <button onClick={() => draw('drawRamp')}>Draw ramp</button>
          </div>
        </li>
        <li>
          <b>Name and reshape</b>
          <p>
            Select a volume below and edit Volume name. Faces and edges have movement axes; Extrude face
            extends them. Join source faces connects matching opposite walls. All use this map’s Undo history.
          </p>
          <div className="bsp-inline">
            <button onClick={rename}>Name selected volume</button>
            <button onClick={() => draw('face')}>Edit faces</button>
          </div>
        </li>
        <li>
          <b>Door and trigger</b>
          <p>
            Open the Asset library → Doors &amp; devices. Drag a compatible door and a Trigger volume onto the
            level. Select the trigger → Inspector → Properties → Logic / Events. Choose the door, then Cover
            both sides and Enter → Open. Native HaloScript stays editable.
          </p>
          <button onClick={objects}>Open door &amp; trigger assets</button>
        </li>
        <li>
          <b>Save, build and play</b>
          <p>
            File → Save or Ctrl+S saves this source. File → Save As reviews a native map copy. Fix Diagnostics, connect matching Halo tools and tags in Build settings,
            then Build &amp; check playtest. Test the floor, ramp and door from both sides in Halo.
          </p>
          <button onClick={build}>Open build settings</button>
        </li>
      </ol>
      <small>
        Named volumes organize editable level geometry. Doors and triggers are separate gameplay placements. A
        source preview becomes game geometry after a native build.
      </small>
    </details>
  );
}
