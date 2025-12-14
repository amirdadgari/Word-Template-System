import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import TemplatesPage from './pages/TemplatesPage';
import UploadPage from './pages/UploadPage';
import TemplateDetailPage from './pages/TemplateDetailPage';
import GeneratePage from './pages/GeneratePage';

export default function App() {
  return (
    <div>
      <div className="card" style={{ borderRadius: 0 }}>
        <div className="container row-wrap" style={{ justifyContent: 'space-between' }}>
          <div className="row-wrap">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <strong>Word Doc Generator</strong>
            </Link>
            <span className="pill">DOCX + JSON</span>
          </div>
          <div className="row-wrap">
            <Link to="/upload">Upload template</Link>
          </div>
        </div>
      </div>

      <div className="container">
        <Routes>
          <Route path="/" element={<TemplatesPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/templates/:id" element={<TemplateDetailPage />} />
          <Route path="/templates/:id/generate" element={<GeneratePage />} />
        </Routes>
      </div>
    </div>
  );
}

