import { useId } from 'react';
import { ArrowRight, FileCode2, RotateCcw } from 'lucide-react';
import { classNames, fieldValue, formatNumber, shortPath } from '../editor';
import type { Project, Tag, TagField } from '../types';
import { NumberField } from './ui';

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
  return tag.fields.length ? (
    <>
      {tag.fields.map((field) => {
        const value = fieldValue(project, tag, field),
          changed = value !== field.value;
        return (
          <div className={`property-row ${changed ? 'changed' : ''}`} key={field.key}>
            <div>
              <label htmlFor={`${prefix}-${field.key}`}>{field.label}</label>
              <small>
                {field.unit ||
                  (field.kind === 'reference'
                    ? `Reference · ${classNames[field.targetClass ?? ''] ?? field.targetClass}`
                    : 'Float32')}
                {advanced && ` · 0x${field.offset.toString(16).toUpperCase()}`}
              </small>
            </div>
            <div className="property-value">
              {field.kind === 'reference' ? (
                <select
                  id={`${prefix}-${field.key}`}
                  aria-label={field.label}
                  value={value}
                  onChange={(event) => change(field, Number(event.target.value))}
                >
                  {tags
                    .filter((candidate) => candidate.class === field.targetClass)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {shortPath(candidate.path)}
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
            {changed && (
              <div className="property-diff">
                <span>
                  {field.kind === 'reference'
                    ? shortPath(
                        tags.find((candidate) => candidate.id === field.value)?.path ?? String(field.value),
                      )
                    : formatNumber(field.value)}
                </span>
                <ArrowRight size={11} />
                <strong>
                  {field.kind === 'reference'
                    ? shortPath(tags.find((candidate) => candidate.id === value)?.path ?? String(value))
                    : formatNumber(value)}
                </strong>
              </div>
            )}
          </div>
        );
      })}
    </>
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
