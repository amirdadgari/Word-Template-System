import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, JsonInput, TemplateField } from '../api';

type TemplateDetail = {
  template: { id: string; name: string; originalFilename: string };
  fields: TemplateField[];
  jsonInputs: JsonInput[];
  inputShape: unknown;
};

export default function GeneratePage() {
  const { id } = useParams();
  const templateId = id!;
  const [detail, setDetail] = React.useState<TemplateDetail | null>(null);
  const [jsonText, setJsonText] = React.useState('{\n\n}');
  const [name, setName] = React.useState('Example 1');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastDownload, setLastDownload] = React.useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const d = await apiGet<TemplateDetail>(`/api/templates/${templateId}`);
      setDetail(d);
      if (d.fields.length > 0) {
        const shape = JSON.stringify(d.inputShape, null, 2);
        setJsonText(shape);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  React.useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function generate() {
    setError(null);
    setLastDownload(null);
    setBusy(true);
    try {
      const res = await apiPost<{ id: string; downloadUrl: string }>(`/api/templates/${templateId}/render`, {
        json: jsonText
      });
      setLastDownload(res.downloadUrl);
      window.location.href = res.downloadUrl;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveJson() {
    setError(null);
    try {
      const parsed = JSON.parse(jsonText);
      await apiPost(`/api/templates/${templateId}/json-inputs`, { name, data: parsed });
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeJson(id: string) {
    await apiDelete(`/api/json-inputs/${id}`);
    await reload();
  }

  return (
    <div className="grid2">
      <div className="card">
        <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Generate</h2>
            <div className="muted">{detail?.template.name}</div>
          </div>
          <Link to={`/templates/${templateId}`}>
            <button className="secondary">Back</button>
          </Link>
        </div>

        <div className="spacer" />
        {error ? <div className="muted">{error}</div> : null}

        <div className="spacer" />
        <div className="muted">Input JSON</div>
        <textarea rows={18} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
        <div className="spacer" />
        <button onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate DOCX'}
        </button>
        {lastDownload ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Downloaded from <span className="mono">{lastDownload}</span>
          </div>
        ) : null}

        <div className="spacer" />
        <h3 style={{ marginBottom: 6 }}>Save JSON</h3>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example name" />
          <button className="secondary" onClick={saveJson}>
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Saved JSON inputs</h3>
        {!detail ? <div className="muted">Loading…</div> : null}
        {detail?.jsonInputs.length === 0 ? <div className="muted">None saved.</div> : null}
        {detail?.jsonInputs.map((j) => (
          <div key={j.id} className="card" style={{ marginTop: 10 }}>
            <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{j.name}</strong>
                <div className="muted mono">{new Date(j.createdAt).toLocaleString()}</div>
              </div>
              <div className="row-wrap">
                <button
                  className="secondary"
                  onClick={() => {
                    setJsonText(JSON.stringify(JSON.parse(j.dataJson), null, 2));
                  }}
                >
                  Load
                </button>
                <button className="secondary" onClick={() => removeJson(j.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
