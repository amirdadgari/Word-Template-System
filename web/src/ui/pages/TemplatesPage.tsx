import React from 'react';
import { Link } from 'react-router-dom';
import { apiGet, TemplateListItem } from '../api';

export default function TemplatesPage() {
  const [items, setItems] = React.useState<TemplateListItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiGet<TemplateListItem[]>('/api/templates')
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="card">
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Templates</h2>
        <Link to="/upload">
          <button>Upload</button>
        </Link>
      </div>
      <div className="spacer" />
      {error ? <div className="muted">{error}</div> : null}
      {!items ? <div className="muted">Loading…</div> : null}
      {items && items.length === 0 ? <div className="muted">No templates yet.</div> : null}
      {items?.map((t) => (
        <div key={t.id} className="card" style={{ marginTop: 10 }}>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>
                <strong>{t.name}</strong>
              </div>
              <div className="muted mono">{t.originalFilename}</div>
            </div>
            <Link to={`/templates/${t.id}`}>
              <button className="secondary">Open</button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

