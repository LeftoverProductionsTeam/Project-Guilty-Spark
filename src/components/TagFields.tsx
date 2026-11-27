import { useId, useState } from 'react';
import { ArrowRight, ChevronDown, FileCode2, RotateCcw } from 'lucide-react';
import { classNames, effectiveReferenceId, fieldValue, formatNumber, shortPath } from '../editor';
import type { Project, Tag, TagField } from '../types';
import { NumberField } from './ui';
import { renamedTagPath } from '../tagRenames';

const isVehicleRule = (field: TagField) => field.key.startsWith('vehicle-spawn-flags-');
const vehicleModes = ['Slayer', 'Capture the Flag', 'King of the Hill', 'Oddball'];

function VehicleRules({ project, tag, rules, change }: {
  project: Project;
  tag: Tag;
  rules: TagField[];
  change: (field: TagField, value: number) => void;
}) {
  const [selected, select] = useState('');
  const field = rules.find(rule => rule.key === selected) ?? rules[0];
  const value = fieldValue(project, tag, field);
  return <fieldset className="vehicle-placement-rules">
    <legend>Multiplayer vehicle placement</legend>
    <p className="subtle">Standard variants use Default. Forerunner’s MCC Survival menu includes Allowed placements from the map’s authored roster.</p>
    <label>Vehicle placement <select value={field.key} onChange={event => select(event.target.value)}>
      {rules.map(rule => <option key={rule.key} value={rule.key}>{rule.label}</option>)}
    </select></label>
    <table>
      <thead><tr><th scope="col">Mode</th><th scope="col">Default</th><th scope="col">Allowed</th></tr></thead>
      <tbody>{vehicleModes.map((mode, bit) => <tr key={mode}>
        <th scope="row">{mode}</th>
        {['Default', 'Allowed'].map((rule, column) => {
          const mask = 1 << (bit + column * 8);
          return <td key={rule}><input type="checkbox" aria-label={mode + ' ' + rule.toLowerCase()}
            checked={!!(value & mask)}
            onChange={event => change(field, event.currentTarget.checked ? value | mask : value & ~mask)} /></td>;
        })}
      </tr>)}</tbody>
    </table>
    <button type="button" disabled={value === field.value} onClick={() => change(field, field.value)}>Reset this placement’s rules</button>
  </fieldset>;
}

/** The same audited field controls serve the full Tag editor and the viewport drawer. */
export default function TagFields({
  project,
  tag,
  tags,
  advanced = false,
  change,
  onNavigate,
}: {
  project: Project;
  tag: Tag;
  tags: Tag[];
  advanced?: boolean;
  change: (field: TagField, value: number) => void;
  onNavigate?: (id: number) => void;
}) {
  const prefix = useId();
  const referencePath = (id:number) => {
    const target=tags.find(candidate=>candidate.id===id);
    return target ? renamedTagPath(project,target) : 'Unresolved reference · '+id;
  };
  const vehicleRules = tag.fields.filter(isVehicleRule);
  const usesCarrierReference = tag.fields.some(field => field.targetClass === 'actv' || field.targetClass === 'vehi');
  const physics = tag.class === 'vehi' && usesCarrierReference ? tag.references
    .filter(ref => ref.class === 'phys')
    .map(ref => tags.find(target => target.id === effectiveReferenceId(project,tag,ref) && target.class === 'phys'))
    .find(target => target !== undefined) : undefined;
  return tag.fields.length ? (
    <>
      {usesCarrierReference && <p className="subtle">Choose a replacement from this map. Save an edited map copy and test it in the target game.</p>}
      {physics && onNavigate && <button type="button" className="small-button" onClick={()=>onNavigate(physics.id)}>Open carrier physics</button>}
      {tag.class === 'phys' && <p className="subtle">These coefficients apply to every object that uses this physics tag.</p>}
      {!!vehicleRules.length && <VehicleRules project={project} tag={tag} rules={vehicleRules} change={change} />}
      {tag.fields.filter(field => !isVehicleRule(field)).map((field) => {
        const value = fieldValue(project, tag, field),
          changed = value !== field.value;
        const detailedReference = field.kind === 'reference' && ['proj', 'actv', 'vehi'].includes(field.targetClass ?? '');
        const references=field.kind==='reference' ? tags.filter(candidate=>candidate.class===field.targetClass) : [];
        const linked = detailedReference && references.some(candidate=>candidate.id===value);
        if(detailedReference)references.sort((a,b)=>shortPath(renamedTagPath(project,a)).localeCompare(shortPath(renamedTagPath(project,b)))||renamedTagPath(project,a).localeCompare(renamedTagPath(project,b)));
        const picker = field.kind === 'reference' && (
          <select
            id={`${prefix}-${field.key}`}
            aria-label={field.label}
            value={value}
            title={referencePath(value)}
            onChange={(event) => change(field, Number(event.target.value))}
          >
            {!references.some(candidate => candidate.id === value) && (
              <option value={value} disabled>Unresolved reference · {value}</option>
            )}
            {references.map((candidate) => {
              const path = renamedTagPath(project, candidate);
              return (
                <option key={candidate.id} value={candidate.id}>
                  {detailedReference
                    ? shortPath(path) + ' · ' + (path.split(/[\\/]/).slice(0, -1).join('/') || 'map root')
                    : shortPath(path)}
                </option>
              );
            })}
          </select>
        );
        return (
          <div className={['property-row', changed && 'changed', detailedReference && 'property-row--projectile'].filter(Boolean).join(' ')} key={field.key}>
            <div>
              <label htmlFor={`${prefix}-${field.key}`}>{field.label}</label>
              <small>
                {field.unit ||
                  (field.kind === 'reference'
                    ? `Reference · ${classNames[field.targetClass ?? ''] ?? field.targetClass}`
                    : field.kind === 'f32' ? 'Float32' : field.kind.toUpperCase())}
                {advanced && ` · 0x${field.offset.toString(16).toUpperCase()}`}
              </small>
            </div>
            <div className="property-value">
              {field.kind === 'reference' ? (
                detailedReference ? (
                  <div className="property-projectile-picker">
                    {picker}
                    <span className="property-projectile-path" aria-hidden="true">{referencePath(value)}</span>
                    <ChevronDown size={13} aria-hidden="true" />
                  </div>
                ) : picker
              ) : (
                <NumberField
                  label={field.label}
                  value={value}
                  min={field.min}
                  max={field.max}
                  step={field.kind === 'f32' ? undefined : 1}
                  onCommit={(next) => change(field, next)}
                />
              )}
              {linked && onNavigate && <button type="button" className="field-reset"
                aria-label={`Open ${field.label} tag`} title={referencePath(value)} onClick={()=>onNavigate(value)}>
                <ArrowRight size={13} />
              </button>}
              <button
                className="field-reset"
                aria-label={`Reset ${field.label}`}
                disabled={!changed}
                onClick={() => change(field, field.value)}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {changed && (
              <div className="property-diff">
                <span>
                  {field.kind === 'reference'
                    ? detailedReference ? referencePath(field.value) : shortPath(referencePath(field.value))
                    : formatNumber(field.value)}
                </span>
                <ArrowRight size={11} />
                <strong>
                  {field.kind === 'reference'
                    ? detailedReference ? referencePath(value) : shortPath(referencePath(value))
                    : formatNumber(value)}
                </strong>
              </div>
            )}
          </div>
        );
      })}
    </>
  ) : tag.class==='bitm' ? (
    <p className="subtle">Original pixels are read-only. Full field editing requires compatible source tags and tools; unknown bytes stay preserved.</p>
  ) : (
    <div className="read-only-tag">
      <FileCode2 size={24} />
      <h3>This tag is indexed for inspection</h3>
      <p>
        Its full field schema is not implemented. Unknown bytes are preserved in the original cache and
        handled by the extraction tool.
      </p>
    </div>
  );
}
