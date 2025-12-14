import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import JSZip from 'jszip';
import he from 'he';

import { getDb } from './sqlite.js';
import {
  docxToHtml,
  readFileBuffer,
  renderDocxTemplate,
  replaceAllTextAcrossRuns,
  extractTextFromDocumentXml,
  tokenizedEditorXml,
  transformTextNodes,
  updateDocxDocumentXml,
  buildInputShapeFromJsonPaths,
  evaluateJsonPath
} from './docx.js';
import {
  templateDir,
  templateOriginalPath,
  templateWorkingPath,
  generatedPath
} from './storage.js';
import { preprocessCustomDirectives } from './templateSyntax.js';

const upload = multer({ storage: multer.memoryStorage() });

export const apiRouter = express.Router();

async function readDocumentXmlFromDocxBuffer(docxBuffer) {
  const zip = await JSZip.loadAsync(docxBuffer);
  return zip.file('word/document.xml').async('string');
}

async function writeDocumentXmlToDocxBuffer(docxBuffer, documentXml) {
  const zip = await JSZip.loadAsync(docxBuffer);
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function extractJsonPathsFromText(text) {
  const matches = text.match(/\$\.[A-Za-z0-9_\[\].-]+/g) ?? [];
  return Array.from(new Set(matches.filter((p) => p.length > 2))).sort();
}

apiRouter.get('/health', (req, res) => {
  res.json({ ok: true });
});

apiRouter.get('/templates', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, original_filename as originalFilename, created_at as createdAt FROM templates ORDER BY created_at DESC`
    )
    .all();
  res.json(rows);
});

apiRouter.post('/templates', upload.single('file'), async (req, res) => {
  const db = getDb();
  const name = String(req.body?.name ?? '').trim() || 'Untitled';
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Missing file' });
  if (!file.originalname.toLowerCase().endsWith('.docx')) {
    return res.status(400).json({ error: 'Only .docx is supported' });
  }

  const id = nanoid();
  await fs.mkdir(templateDir(id), { recursive: true });

  const originalPath = templateOriginalPath(id, file.originalname);
  const workingPath = templateWorkingPath(id, file.originalname);
  await fs.writeFile(originalPath, file.buffer);
  await fs.writeFile(workingPath, file.buffer);

  db.prepare(
    `INSERT INTO templates (id, name, original_filename, original_path, working_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, file.originalname, originalPath, workingPath, new Date().toISOString());

  res.json({ id, name, originalFilename: file.originalname });
});

apiRouter.get('/templates/:id', (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const template = db
    .prepare(
      `SELECT id, name, original_filename as originalFilename, created_at as createdAt FROM templates WHERE id = ?`
    )
    .get(id);
  if (!template) return res.status(404).json({ error: 'Not found' });

  const jsonInputs = db
    .prepare(
      `SELECT id, name, data_json as dataJson, created_at as createdAt
       FROM json_inputs WHERE template_id = ? ORDER BY created_at DESC`
    )
    .all(id);

  const fields = db
    .prepare(
      `SELECT json_path as jsonPath, created_at as createdAt
       FROM template_fields WHERE template_id = ? ORDER BY json_path ASC`
    )
    .all(id);

  const inputShape = buildInputShapeFromJsonPaths(fields.map((f) => f.jsonPath));
  res.json({ template, fields, jsonInputs, inputShape });
});

apiRouter.get('/templates/:id/preview', async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const row = db.prepare(`SELECT working_path as workingPath FROM templates WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const buf = await readFileBuffer(row.workingPath);
  const html = await docxToHtml(buf);
  res.json({ html });
});

apiRouter.get('/templates/:id/editor', async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const row = db
    .prepare(`SELECT name, working_path as workingPath FROM templates WHERE id = ?`)
    .get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const buf = await readFileBuffer(row.workingPath);
  const originalXml = await readDocumentXmlFromDocxBuffer(buf);
  const { tokenizedXml, tokenToOriginal } = tokenizedEditorXml(originalXml);
  const tokenizedBuf = await writeDocumentXmlToDocxBuffer(buf, tokenizedXml);

  const htmlRaw = await docxToHtml(tokenizedBuf);
  const html = htmlRaw.replace(/\[\[T:(t\d+)\]\]/g, (_m, tokenId) => {
    const original = tokenToOriginal[tokenId] ?? '';
    const escaped = he.encode(original, { useNamedReferences: true });
    return `<span class="tpl-token" data-token="${tokenId}" contenteditable="true">${escaped}</span>`;
  });

  res.json({ html, name: row.name });
});

apiRouter.post('/templates/:id/editor/save', async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const row = db.prepare(`SELECT working_path as workingPath FROM templates WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const bodySchema = z.object({
    tokens: z.record(z.string(), z.string())
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const buf = await readFileBuffer(row.workingPath);
  const updatedBuf = await updateDocxDocumentXml(buf, (xml) =>
    transformTextNodes(xml, (text, idx) => {
      const tokenId = `t${idx}`;
      if (Object.prototype.hasOwnProperty.call(parsed.data.tokens, tokenId)) return parsed.data.tokens[tokenId];
      return text;
    })
  );
  await fs.writeFile(row.workingPath, updatedBuf);

  const updatedXml = await readDocumentXmlFromDocxBuffer(updatedBuf);
  const jsonPaths = extractJsonPathsFromText(extractTextFromDocumentXml(updatedXml));

  db.prepare(`DELETE FROM template_fields WHERE template_id = ?`).run(id);
  const ins = db.prepare(
    `INSERT OR IGNORE INTO template_fields (id, template_id, json_path, created_at) VALUES (?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  for (const p of jsonPaths) ins.run(nanoid(), id, p, now);

  const inputShape = buildInputShapeFromJsonPaths(jsonPaths);
  res.json({ ok: true, jsonPaths, inputShape });
});

apiRouter.post('/templates/:id/json-inputs', async (req, res) => {
  const db = getDb();
  const templateId = String(req.params.id);
  const tpl = db.prepare(`SELECT id FROM templates WHERE id = ?`).get(templateId);
  if (!tpl) return res.status(404).json({ error: 'Not found' });

  const bodySchema = z.object({
    name: z.string().min(1),
    data: z.any()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const id = nanoid();
  db.prepare(
    `INSERT INTO json_inputs (id, template_id, name, data_json, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, templateId, parsed.data.name, JSON.stringify(parsed.data.data), new Date().toISOString());

  res.json({ id });
});

apiRouter.delete('/json-inputs/:id', (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  db.prepare(`DELETE FROM json_inputs WHERE id = ?`).run(id);
  res.json({ ok: true });
});

apiRouter.post('/templates/:id/render', async (req, res) => {
  const db = getDb();
  const templateId = String(req.params.id);
  const row = db
    .prepare(
      `SELECT id, name, original_filename as originalFilename, working_path as workingPath FROM templates WHERE id = ?`
    )
    .get(templateId);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const fields = db
    .prepare(`SELECT json_path as jsonPath FROM template_fields WHERE template_id = ? ORDER BY json_path ASC`)
    .all(templateId);

  const bodySchema = z.object({
    json: z.union([z.string(), z.record(z.any())])
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  let data;
  try {
    data = typeof parsed.data.json === 'string' ? JSON.parse(parsed.data.json) : parsed.data.json;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const vars = {};
  const jsonPathToVar = new Map();
  let jsonPaths = fields.map((f) => f.jsonPath);
  if (jsonPaths.length === 0) {
    const tplBuf = await readFileBuffer(row.workingPath);
    const xml = await readDocumentXmlFromDocxBuffer(tplBuf);
    jsonPaths = extractJsonPathsFromText(extractTextFromDocumentXml(xml));
  }
  for (let i = 0; i < jsonPaths.length; i++) {
    const jsonPath = jsonPaths[i];
    const varName = `p_${i}`;
    jsonPathToVar.set(jsonPath, varName);
    vars[varName] = evaluateJsonPath(data, jsonPath);
  }

  const registered = new Map();
  const registerVar = (kind, expr, computeFn) => {
    const key = `${kind}:${expr}`;
    if (registered.has(key)) return registered.get(key);
    const varName = `${kind}_${nanoid(6)}`;
    registered.set(key, varName);
    try {
      vars[varName] = computeFn();
    } catch {
      vars[varName] = undefined;
    }
    return varName;
  };

  const tplBuf = await readFileBuffer(row.workingPath);
  const outBuf = await renderDocxTemplate({
    templateBuffer: tplBuf,
    data: vars,
    preprocess: (documentXml) => {
      let xml = preprocessCustomDirectives(documentXml, data, registerVar);
      // Replace raw JSONPath tokens in the template with docx-templates placeholders.
      for (const [jsonPath, varName] of jsonPathToVar.entries()) {
        xml = replaceAllTextAcrossRuns(xml, jsonPath, `{{${varName}}}`);
      }
      return xml;
    }
  });

  const outputId = nanoid();
  const outputFilename = `generated-${row.originalFilename}`;
  const outPath = generatedPath(outputId, outputFilename);
  await fs.writeFile(outPath, outBuf);

  db.prepare(
    `INSERT INTO generated_docs (id, template_id, output_filename, output_path, input_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(outputId, templateId, outputFilename, outPath, JSON.stringify(data), new Date().toISOString());

  res.json({ id: outputId, downloadUrl: `/api/generated/${outputId}/download` });
});

apiRouter.get('/generated/:id/download', async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const row = db
    .prepare(`SELECT output_filename as outputFilename, output_path as outputPath FROM generated_docs WHERE id = ?`)
    .get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.download(row.outputPath, row.outputFilename);
});
