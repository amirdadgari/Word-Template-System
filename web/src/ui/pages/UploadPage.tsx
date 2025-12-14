import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function UploadPage() {
  const nav = useNavigate();
  const [name, setName] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!file) {
      setError('Pick a .docx file');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('name', name);
      form.append('file', file);
      const res = await fetch('/api/templates', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      nav(`/templates/${created.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Upload DOCX template</h2>
      <div className="grid2">
        <div>
          <div className="muted">Template name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Template" />
        </div>
        <div>
          <div className="muted">DOCX file</div>
          <input
            type="file"
            accept=".docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="spacer" />
      {error ? <div className="muted">{error}</div> : null}
      <button onClick={submit} disabled={busy}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      <div className="spacer" />
      <div className="muted">
        After upload, edit the template by typing JSONPaths like <span className="mono">$.title</span> directly in the
        preview, then click Save.
      </div>
    </div>
  );
}
