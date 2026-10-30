import { toolFindings } from '../toolFindings';
export default function ToolFindings() {
  return (
    <details className="tool-findings">
      <summary>Known tool behaviors &amp; test findings</summary>
      <p>
        Findings apply to the stated version, format and test. A validator detecting damage is not evidence
        that the validator wrote it. Unidentified writes remain unknown.
      </p>
      {toolFindings.map((f) => (
        <section key={f.tool}>
          <strong>
            {f.tool} · {f.version}
          </strong>
          <p>
            {f.status}: {f.detail}
          </p>
          <small>{f.action}</small>
        </section>
      ))}
    </details>
  );
}
