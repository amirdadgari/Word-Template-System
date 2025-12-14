import {
  evaluateJsonPath,
  extractTextFromDocumentXml,
  replaceAllTextAcrossRuns,
  replaceFirstTextAcrossRuns
} from './docx.js';

function findNextToken(text) {
  const patterns = [
    { type: 'ifStart', re: /@if\s*\(\s*([^)]+?)\s*\)\s*\{/gi },
    { type: 'forStart', re: /@for\s*\(\s*([^)]+?)\s*\)\s*\{/gi },
    { type: 'ifEnd', re: /@endif\b/gi },
    { type: 'forEnd', re: /@endfor\b/gi }
  ];

  let best = null;
  for (const p of patterns) {
    p.re.lastIndex = 0;
    const m = p.re.exec(text);
    if (!m) continue;
    if (!best || m.index < best.index) {
      best = { type: p.type, match: m[0], index: m.index, group: m[1] };
    }
  }
  return best;
}

function popLast(stack, type) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].type === type) return stack.splice(i, 1)[0];
  }
  return null;
}

export function preprocessCustomDirectives(documentXml, jsonData, registerVar) {
  // Supported in-template directives:
  // - @if ($.isActive) { ... @endif
  // - @for ($.myArray) { ... @endfor
  //
  // They will be converted to docx-templates commands using cmdDelimiter ['{{','}}'].
  // For loops, the loop variable name will be `item`, or `item2`, `item3` for nested loops.

  let xml = documentXml;
  const stack = [];
  let forDepth = 0;
  const forMappings = [];

  for (let guard = 0; guard < 500; guard++) {
    const text = extractTextFromDocumentXml(xml);
    const token = findNextToken(text);
    if (!token) break;

    if (token.type === 'ifStart') {
      const expr = String(token.group ?? '').trim();
      const varName = registerVar('if', expr, () => Boolean(evaluateJsonPath(jsonData, expr)));
      const rep = `{{IF ${varName}}}`;
      const r = replaceFirstTextAcrossRuns(xml, token.match, rep);
      if (!r.replaced) break;
      xml = r.documentXml;
      stack.push({ type: 'if' });
      continue;
    }

    if (token.type === 'forStart') {
      const expr = String(token.group ?? '').trim();
      const varName = registerVar('for', expr, () => {
        const v = evaluateJsonPath(jsonData, expr);
        return Array.isArray(v) ? v : v == null ? [] : [v];
      });
      forDepth += 1;
      const itemVar = forDepth === 1 ? 'item' : `item${forDepth}`;
      const rep = `{{FOR ${itemVar} IN ${varName}}}`;
      const r = replaceFirstTextAcrossRuns(xml, token.match, rep);
      if (!r.replaced) break;
      xml = r.documentXml;
      stack.push({ type: 'for', itemVar });
      forMappings.push({ expr, itemVar });
      continue;
    }

    if (token.type === 'ifEnd') {
      const rep = '{{END-IF}}';
      const r = replaceFirstTextAcrossRuns(xml, token.match, rep);
      if (!r.replaced) break;
      xml = r.documentXml;
      popLast(stack, 'if');
      continue;
    }

    if (token.type === 'forEnd') {
      const frame = popLast(stack, 'for');
      const itemVar = frame?.itemVar ?? 'item';
      const rep = `{{END-FOR ${itemVar}}}`;
      const r = replaceFirstTextAcrossRuns(xml, token.match, rep);
      if (!r.replaced) break;
      xml = r.documentXml;
      continue;
    }
  }

  // Best-effort support for "$.myArray[_index]" in templates:
  // if we saw "@for ($.myArray) {", we replace "$.myArray[_index]" -> "$item" (or "$item2", etc).
  for (const m of forMappings) {
    xml = replaceAllTextAcrossRuns(xml, `${m.expr}[_index]`, `$${m.itemVar}`);
  }

  return xml;
}
