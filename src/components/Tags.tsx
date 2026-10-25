import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, FileCode2, GitBranch, RotateCcw, Search, Sparkles } from 'lucide-react';
import type { MapInspection, Project, Tag, TagField } from '../types';
import {
  classNames,
  effectiveReferenceId,
  fieldValue,
  formatNumber,
  setTagValue,
  shortPath,
} from '../editor';
import { Empty, Notice, NumberField, Pill } from './ui';
import Sound from './Sound';
export default function Tags({
  project,
  inspection,
  edit,
  notify,
}: {
  project: Project;
  inspection: MapInspection | null;
  edit: (p: Project, d: string) => void;
  notify: (m: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<number | null>(
    inspection?.tags.find((t) => t.class === 'weap')?.id ?? inspection?.tags[0]?.id ?? null,
  );
  const [limit, setLimit] = useState(300);
  const [advanced, setAdvanced] = useState(false);
  const tags = inspection?.tags ?? [];
  const selectedTag = tags.find((t) => t.id === selected);
  const classes = useMemo(() => [...new Set(tags.map((t) => t.class))].sort(), [tags]);
  const shown = useMemo(
    () =>
      tags.filter(
        (t) =>
          (filter === 'all' || t.class === filter) &&
          (t.path.toLowerCase().includes(query.toLowerCase()) ||
            t.class.toLowerCase().includes(query.toLowerCase())),
      ),
    [tags, query, filter],
  );
  function change(tag: Tag, field: TagField, value: number) {
    try {
      if (field.kind === 'reference' && !tags.some((t) => t.id === value && t.class === field.targetClass))
        throw new Error('Choose a tag of the required class from this map');
      edit(setTagValue(project, tag, field, value), `${shortPath(tag.path)}: ${field.label}`);
    } catch (e) {
      notify(String(e));
    }
  }
  const projectile = selectedTag?.fields.find((f) => f.kind === 'reference' && f.targetClass === 'proj');
  const rocket = tags.find((t) => t.class === 'proj' && /rocket/i.test(t.path));
  if (!inspection)
    return (
      <Empty icon={<FileCode2 size={30} />} title="Open a Halo map to browse its tags">
        The tag browser reads the source cache’s real tag index. An asset-only project does not contain Halo
        tags.
      </Empty>
    );
  return (
    <div className="tag-layout">
      <aside className="panel tag-browser">
        <div className="panel-heading">
          <strong>Tag browser</strong>
          <Pill>{formatNumber(tags.length)}</Pill>
        </div>
        <div className="panel-search">
          <Search size={14} />
          <input
            aria-label="Search tags"
            placeholder="Search paths or classes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(300);
            }}
          />
        </div>
        <select
          className="class-filter"
          aria-label="Filter tag class"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(300);
          }}
        >
          <option value="all">All tag classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {classNames[c] ?? c} ({c})
            </option>
          ))}
        </select>
        <div className="tag-list">
          {shown.slice(0, limit).map((t) => (
            <button
              className={`tag-row ${selected === t.id ? 'selected' : ''}`}
              key={t.id}
              onClick={() => setSelected(t.id)}
            >
              <span className={`tag-class class-${t.class}`}>{t.class}</span>
              <span>
                <strong>{shortPath(t.path)}</strong>
                <small>{t.path.split(/[\\/]/).slice(0, -1).join(' / ')}</small>
              </span>
              {project.tagEdits.some((e) => e.tagId === t.id) && <span className="edit-dot" />}
            </button>
          ))}
          {shown.length > limit && (
            <button className="load-more" onClick={() => setLimit((v) => v + 300)}>
              Show more tags ({shown.length - limit} remaining)
            </button>
          )}
          {shown.length === 0 && <div className="list-empty">No tags match this search.</div>}
        </div>
        <div className="panel-foot">{shown.length} matching · indexed from cache</div>
      </aside>
      <section className="tag-detail">
        {selectedTag ? (
          <>
            <div className="tag-detail-heading">
              <div className="eyebrow">
                {classNames[selectedTag.class] ?? 'Tag'} · {selectedTag.class}
              </div>
              <h2>{shortPath(selectedTag.path)}</h2>
              <code>{selectedTag.path}</code>
              <div className="tag-badges">
                <Pill tone="blue">ID {selectedTag.id.toString(16).toUpperCase()}</Pill>
                <Pill>{selectedTag.external ? 'External resource' : 'Embedded tag'}</Pill>
                <Pill tone={selectedTag.fields.length ? 'green' : 'muted'}>
                  {selectedTag.fields.length ? 'Typed fields available' : 'Inspection only'}
                </Pill>
              </div>
            </div>
            {projectile && rocket && (
              <div className="preset-bar">
                <div>
                  <Sparkles size={18} />
                  <span>
                    <strong>A little 2007 energy</strong>
                    <small>Swap this weapon’s first trigger to an existing rocket projectile.</small>
                  </span>
                </div>
                <button onClick={() => change(selectedTag, projectile, rocket.id)}>
                  Use rocket projectile
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <div className="field-table">
              <div className="field-table-title">
                <h3>Properties</h3>
                <label className="checkbox-label">
                  <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                  Show offsets
                </label>
              </div>
              {selectedTag.fields.length ? (
                selectedTag.fields.map((f) => {
                  const value = fieldValue(project, selectedTag, f);
                  const changed = value !== f.value;
                  return (
                    <div className={`property-row ${changed ? 'changed' : ''}`} key={f.key}>
                      <div>
                        <label htmlFor={`field-${f.key}`}>{f.label}</label>
                        <small>
                          {f.unit ||
                            (f.kind === 'reference'
                              ? `Reference · ${classNames[f.targetClass ?? ''] ?? f.targetClass}`
                              : 'Float32')}
                          {advanced && ` · 0x${f.offset.toString(16).toUpperCase()}`}
                        </small>
                      </div>
                      <div className="property-value">
                        {f.kind === 'reference' ? (
                          <select
                            id={`field-${f.key}`}
                            aria-label={f.label}
                            value={value}
                            onChange={(e) => change(selectedTag, f, Number(e.target.value))}
                          >
                            {tags
                              .filter((t) => t.class === f.targetClass)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {shortPath(t.path)}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <NumberField
                            label={f.label}
                            value={value}
                            min={f.min}
                            max={f.max}
                            onCommit={(v) => change(selectedTag, f, v)}
                          />
                        )}
                        <button
                          className="field-reset"
                          aria-label={`Reset ${f.label}`}
                          disabled={!changed}
                          onClick={() => change(selectedTag, f, f.value)}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                      {changed && (
                        <div className="property-diff">
                          <span>
                            {f.kind === 'reference'
                              ? shortPath(tags.find((t) => t.id === f.value)?.path ?? String(f.value))
                              : formatNumber(f.value)}
                          </span>
                          <ArrowRight size={11} />
                          <strong>
                            {f.kind === 'reference'
                              ? shortPath(tags.find((t) => t.id === value)?.path ?? String(value))
                              : formatNumber(value)}
                          </strong>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="read-only-tag">
                  <FileCode2 size={24} />
                  <h3>This tag is indexed for inspection</h3>
                  <p>
                    Its full field schema is not implemented. Unknown bytes are preserved in the original
                    cache and handled by the extraction tool.
                  </p>
                </div>
              )}
            </div>
            {selectedTag.class === 'snd!' && (
              <Sound key={selectedTag.id} projectId={project.id} tagId={selectedTag.id} />
            )}
            {selectedTag.references.length > 0 && (
              <div className="reference-list">
                <h3>Referenced tags</h3>
                {selectedTag.references.map((ref) => {
                  const target = tags.find((t) => t.id === effectiveReferenceId(project, selectedTag, ref));
                  return (
                    <button
                      key={`${ref.offset}-${ref.targetId}`}
                      disabled={!target}
                      onClick={() => target && setSelected(target.id)}
                    >
                      <GitBranch size={14} />
                      <span>
                        <small>{ref.label}</small>
                        <strong>{target?.path ?? 'Unresolved reference'}</strong>
                      </span>
                      <Pill>{ref.class}</Pill>
                      <ArrowRight size={14} />
                    </button>
                  );
                })}
              </div>
            )}
            <Notice tone="info">
              Edits are stored in your .gsproject. The source map stays unchanged. Use Build &amp; Playtest to
              extract, rebuild and validate the edited cache.
            </Notice>
          </>
        ) : (
          <Empty icon={<FileCode2 />} title="Select a tag">
            Inspect properties and relationships, then make changes in your project.
          </Empty>
        )}
      </section>
      <aside className="panel relationships">
        <div className="panel-heading">
          <strong>Relationships</strong>
          <GitBranch size={15} />
        </div>
        {selectedTag && (
          <>
            <div className="dependency-graph">
              <div className="graph-origin">
                <FileCode2 size={18} />
                <strong>{shortPath(selectedTag.path)}</strong>
                <small>{selectedTag.class}</small>
              </div>
              {selectedTag.references.length > 0 && <div className="graph-trunk" />}
              {selectedTag.references.slice(0, 6).map((ref) => {
                const targetId = effectiveReferenceId(project, selectedTag, ref);
                const target = tags.find((t) => t.id === targetId);
                return (
                  <button
                    key={ref.offset}
                    className="graph-target"
                    disabled={!target}
                    onClick={() => setSelected(targetId)}
                  >
                    <span className="graph-branch" />
                    <Pill>{ref.class}</Pill>
                    <span>{shortPath(target?.path ?? 'unresolved')}</span>
                    <ArrowRight size={12} />
                  </button>
                );
              })}
              {selectedTag.references.length === 0 && (
                <p className="subtle">No relationships are indexed for this schema.</p>
              )}
            </div>
            <div className="inspector-section">
              <div className="section-label">Project changes</div>
              <div className="change-count">
                {project.tagEdits.length}
                <span>edited fields</span>
              </div>
              <p className="subtle">A typed overlay preserves the original data, including unknown fields.</p>
              {project.tagEdits.length > 0 && (
                <button
                  className="small-button"
                  onClick={() => edit({ ...project, tagEdits: [] }, 'Reset all tag edits')}
                >
                  <RotateCcw size={13} />
                  Reset all tag edits
                </button>
              )}
            </div>
            <div className="inspector-section">
              <div className="section-label">Recent history</div>
              {project.history
                .slice(-6)
                .reverse()
                .map((h) => (
                  <div className="history-row" key={h.id}>
                    <ArrowDownToLine size={12} />
                    <span>
                      {h.description}
                      <small>
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
