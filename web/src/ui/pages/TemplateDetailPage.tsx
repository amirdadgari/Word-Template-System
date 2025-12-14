import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const templateId = id!;

  const [name, setName] = React.useState<string>('Template');
  const [editorHtml, setEditorHtml] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function reload() {
    setError(null);
    try {
      const e = await apiGet<{ html: string; name: string }>(`/api/templates/${templateId}/editor`);
      setName(e.name);
      setEditorHtml(e.html);
    } catch (e) {
      setError(String(e));
    }
  }

  React.useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  function collectTokens(): Record<string, string> {
    const root = document.getElementById('tpl-editor');
    if (!root) return {};
    const spans = root.querySelectorAll<HTMLSpanElement>('span.tpl-token[data-token]');
    const tokens: Record<string, string> = {};
    spans.forEach((s) => {
      const token = s.dataset.token;
      if (!token) return;
      tokens[token] = s.innerText;
    });
    return tokens;
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const tokens = collectTokens();
      await apiPost(`/api/templates/${templateId}/editor/save`, { tokens });
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <div className="muted">Template editor</div>
        </div>
        <div className="row-wrap">
          <button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <Link to={`/templates/${templateId}/generate`}>
            <button className="secondary">Go to generator</button>
          </Link>
        </div>
      </div>

      <div className="spacer" />
      {error ? <div className="muted">{error}</div> : null}
      {!editorHtml ? <div className="muted">Loading…</div> : null}

      <div className="spacer" />
      <div className="muted">
        Edit the document by typing JSONPaths directly (example: <span className="mono">$.title</span>).
        <div style={{ marginTop: 6 }}>
          Advanced:
          <span className="mono"> @if ($.isActive) {'{'} ... @endif</span> and{' '}
          <span className="mono"> @for ($.myArray) {'{'} ... @endfor</span>
        </div>
      </div>

      <div className="spacer" />
      <div
        id="tpl-editor"
        className="doc-preview"
        dangerouslySetInnerHTML={{ __html: editorHtml }}
        suppressContentEditableWarning
      />
    </div>
  );
}
