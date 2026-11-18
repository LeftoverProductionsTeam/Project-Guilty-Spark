import { useId } from 'react';
import { ArrowRight, FileCode2, RotateCcw } from 'lucide-react';
import { classNames, fieldValue, formatNumber, shortPath } from '../editor';
import type { Project, Tag, TagField } from '../types';
import { NumberField } from './ui';
import { renamedTagPath } from '../tagRenames';

/** The same audited field controls serve the full Tag editor and the viewport drawer. */
export default function TagFields({
  project,
  tag,
  tags,
  advanced = false,
  change,
}: {
  project: Project;
  tag: Tag;
  tags: Tag[];
  advanced?: boolean;
  change: (field: TagField, value: number) => void;
}) {
  const prefix = useId();
  const referencePath = (id:number) => {
    const target=tags.find(candidate=>candidate.id===id);
    return target ? renamedTagPath(project,target) : 'Unresolved reference · '+id;
  };
  return tag.fields.length ? (
    <>
      {tag.fields.map((field) => {
        const value = fieldValue(project, tag, field),
          changed = value !== field.value;
        const projectileField=field.kind==='reference'&&field.targetClass==='proj';
        const references=field.kind==='reference' ? tags.filter(candidate=>candidate.class===field.targetClass) : [];
        if(projectileField)references.sort((a,b)=>shortPath(renamedTagPath(project,a)).localeCompare(shortPath(renamedTagPath(project,b)))||renamedTagPath(project,a).localeCompare(renamedTagPath(project,b)));
        return (
          <div className={['property-row', changed && 'changed', projectileField && 'property-row--projectile'].filter(Boolean).join(' ')} key={field.key}>
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
                <select
                  id={`${prefix}-${field.key}`}
                  aria-label={field.label}
                  value={value}
                  title={referencePath(value)}
                  onChange={(event) => change(field, Number(event.target.value))}
                >
                  {!references.some(candidate=>candidate.id===value)&&<option value={value} disabled>Unresolved reference · {value}</option>}
                  {references.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {shortPath(renamedTagPath(project,candidate))}{projectileField&&' · '+(renamedTagPath(project,candidate).split(/[\\/]/).slice(0,-1).join('/')||'map root')}
                      </option>
                    ))}
                </select>
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
              <button
                className="field-reset"
                aria-label={`Reset ${field.label}`}
                disabled={!changed}
                onClick={() => change(field, field.value)}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {projectileField && <small className="property-reference-path">{referencePath(value)}</small>}
            {changed && (
              <div className="property-diff">
                <span>
                  {field.kind === 'reference'
                    ? projectileField ? referencePath(field.value) : shortPath(referencePath(field.value))
                    : formatNumber(field.value)}
                </span>
                <ArrowRight size={11} />
                <strong>
                  {field.kind === 'reference'
                    ? projectileField ? referencePath(value) : shortPath(referencePath(value))
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
