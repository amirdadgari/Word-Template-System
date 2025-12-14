import fs from 'fs/promises';
import JSZip from 'jszip';
import he from 'he';
import { JSONPath } from 'jsonpath-plus';
import * as docxTemplates from 'docx-templates';

const createReport =
  typeof docxTemplates.default === 'function'
    ? docxTemplates.default
    : typeof docxTemplates.createReport === 'function'
      ? docxTemplates.createReport
      : null;

function escapeXmlText(text) {
  // Minimal XML escaping only; do NOT emit HTML named entities like &nbsp; (not valid in XML).
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlText(text) {
  return he.decode(text);
}

function listTextNodes(documentXml) {
  const regex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  const nodes = [];
  let match;
  while ((match = regex.exec(documentXml)) !== null) {
    const fullMatch = match[0];
    const inner = match[1] ?? '';
    const start = match.index;
    const end = match.index + fullMatch.length;
    const innerStart = start + fullMatch.indexOf('>') + 1;
    const innerEnd = end - '</w:t>'.length;
    nodes.push({
      start,
      end,
      innerStart,
      innerEnd,
      decoded: decodeXmlText(inner)
    });
  }
  return nodes;
}

function concatText(nodes) {
  return nodes.map((n) => n.decoded).join('');
}

export function extractTextFromDocumentXml(documentXml) {
  return concatText(listTextNodes(documentXml));
}

function findSpan(nodes, matchIndex, matchLength) {
  let remaining = matchIndex;
  let startNodeIndex = -1;
  let startOffset = 0;

  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].decoded.length;
    if (remaining <= len) {
      startNodeIndex = i;
      startOffset = remaining;
      break;
    }
    remaining -= len;
  }
  if (startNodeIndex === -1) return null;

  let need = matchLength;
  let endNodeIndex = startNodeIndex;
  let endOffset = startOffset;
  while (need > 0 && endNodeIndex < nodes.length) {
    const available = nodes[endNodeIndex].decoded.length - endOffset;
    if (need <= available) {
      endOffset += need;
      need = 0;
      break;
    }
    need -= available;
    endNodeIndex += 1;
    endOffset = 0;
  }
  if (need !== 0) return null;

  return { startNodeIndex, startOffset, endNodeIndex, endOffset };
}

function applyNodeTextEdits(documentXml, nodes, newTextsByIndex) {
  let out = '';
  let lastIndex = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    out += documentXml.slice(lastIndex, n.innerStart);
    const nextText = newTextsByIndex.get(i);
    out += escapeXmlText(nextText ?? n.decoded);
    out += documentXml.slice(n.innerEnd, n.end);
    lastIndex = n.end;
  }
  out += documentXml.slice(lastIndex);
  return out;
}

export function replaceFirstTextAcrossRuns(documentXml, findText, replaceText) {
  const nodes = listTextNodes(documentXml);
  const full = concatText(nodes);
  const idx = full.indexOf(findText);
  if (idx === -1) return { documentXml, replaced: false };

  const span = findSpan(nodes, idx, findText.length);
  if (!span) return { documentXml, replaced: false };

  const newTexts = new Map();
  for (let i = span.startNodeIndex; i <= span.endNodeIndex; i++) {
    const t = nodes[i].decoded;
    if (i === span.startNodeIndex && i === span.endNodeIndex) {
      newTexts.set(i, t.slice(0, span.startOffset) + replaceText + t.slice(span.endOffset));
      continue;
    }
    if (i === span.startNodeIndex) {
      newTexts.set(i, t.slice(0, span.startOffset) + replaceText);
      continue;
    }
    if (i === span.endNodeIndex) {
      newTexts.set(i, t.slice(span.endOffset));
      continue;
    }
    newTexts.set(i, '');
  }

  return { documentXml: applyNodeTextEdits(documentXml, nodes, newTexts), replaced: true };
}

export function replaceAllTextAcrossRuns(documentXml, findText, replaceText, maxReplacements = 5000) {
  let cur = documentXml;
  for (let i = 0; i < maxReplacements; i++) {
    const r = replaceFirstTextAcrossRuns(cur, findText, replaceText);
    if (!r.replaced) break;
    cur = r.documentXml;
  }
  return cur;
}

export function transformTextNodes(documentXml, transformFn) {
  const nodes = listTextNodes(documentXml);
  const newTexts = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const next = transformFn(nodes[i].decoded, i);
    if (typeof next === 'string') newTexts.set(i, next);
  }
  if (newTexts.size === 0) return documentXml;
  return applyNodeTextEdits(documentXml, nodes, newTexts);
}

export function tokenizedEditorXml(documentXml) {
  const nodes = listTextNodes(documentXml);
  const tokenToOriginal = {};
  const newTexts = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const tokenId = `t${i}`;
    tokenToOriginal[tokenId] = nodes[i].decoded;
    newTexts.set(i, `[[T:${tokenId}]]`);
  }
  return { tokenizedXml: applyNodeTextEdits(documentXml, nodes, newTexts), tokenToOriginal };
}

export async function updateDocxDocumentXml(docxBuffer, transformFn) {
  const zip = await JSZip.loadAsync(docxBuffer);
  const xmlPath = 'word/document.xml';
  const current = await zip.file(xmlPath).async('string');
  const updated = transformFn(current);
  zip.file(xmlPath, updated);
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return out;
}

export async function docxToHtml(docxBuffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer: docxBuffer });
  return result.value;
}

export function buildInputShapeFromJsonPaths(paths) {
  const root = {};
  for (const jp of paths) {
    if (!jp.startsWith('$.')) continue;
    const parts = jp
      .slice(2)
      .split('.')
      .map((p) => p.trim())
      .filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      const hasBracket = seg.includes('[');
      const key = seg.replace(/\[.*\]/g, '');
      if (!key) continue;
      if (i === parts.length - 1) {
        if (hasBracket) {
          if (!Array.isArray(cur[key])) cur[key] = [''];
        } else {
          if (cur[key] === undefined) cur[key] = '';
        }
      } else {
        if (hasBracket) {
          if (!Array.isArray(cur[key])) cur[key] = [{}];
          if (cur[key].length === 0) cur[key].push({});
          if (typeof cur[key][0] !== 'object' || cur[key][0] === null) cur[key][0] = {};
          cur = cur[key][0];
        } else {
          if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) cur[key] = {};
          cur = cur[key];
        }
      }
    }
  }
  return root;
}

export function evaluateJsonPath(data, jsonPath) {
  const value = JSONPath({ path: jsonPath, json: data, wrap: true });
  if (value.length === 0) return undefined;
  if (value.length === 1) return value[0];
  return value;
}

export async function renderDocxTemplate({
  templateBuffer,
  data,
  preprocess
}) {
  if (!createReport) {
    throw new Error('docx-templates createReport export not found');
  }
  const preprocessed = preprocess
    ? await updateDocxDocumentXml(templateBuffer, preprocess)
    : templateBuffer;

  // Normalize/clean any invalid XML entities (e.g. &nbsp;) by re-serializing all <w:t> text nodes.
  const normalized = await updateDocxDocumentXml(preprocessed, (xml) => transformTextNodes(xml, (t) => t));

  const out = await createReport({
    template: normalized,
    data,
    cmdDelimiter: ['{{', '}}'],
    processLineBreaks: true,
    noSandbox: false,
    failFast: true
  });

  return out;
}

export async function readFileBuffer(filePath) {
  return fs.readFile(filePath);
}
