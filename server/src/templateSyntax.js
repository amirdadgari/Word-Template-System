import { evaluateJsonPath, transformTextNodes } from './docx.js';

export function preprocessCustomDirectives(documentXml, jsonData, registerVar) {
  // Table-safe, node-based directive conversion.
  // Directives should be typed within a single editable token (one Word text run),
  // which works inside table cells/rows too.
  //
  // Supported:
  // - @if ($.isActive) {   ...   }   OR  @endif
  // - @for ($.items) {     ...   }   OR  @endfor
  // - Inside a for-block, `$.items[_index].x` will be rewritten to `$item.x` (or `$item2` for nested loops).

  // eslint-disable-next-line no-use-before-define
  const stack = [];
  const forMappings = [];
  let forDepth = 0;

  const ifStartRe = /@if\s*\(\s*([^)]+?)\s*\)\s*\{/gi;
  const forStartRe = /@for\s*\(\s*([^)]+?)\s*\)\s*\{/gi;
  const ifEndRe = /@endif\b/gi;
  const forEndRe = /@endfor\b/gi;

  const out = transformTextNodes(documentXml, (input) => {
    let text = input;

    // Apply any known _index rewrites for previously opened loops.
    for (const m of forMappings) {
      const raw = `${m.expr}[_index]`;
      const rawNoSpace = `${m.expr.replace(/\s+/g, '')}[_index]`;
      text = text.split(raw).join(`$${m.itemVar}`);
      if (rawNoSpace !== raw) text = text.split(rawNoSpace).join(`$${m.itemVar}`);
    }

    // Start directives (can be inside table rows/cells).
    text = text.replace(ifStartRe, (_m, exprRaw) => {
      const expr = String(exprRaw ?? '').trim();
      const varName = registerVar('if', expr, () => Boolean(evaluateJsonPath(jsonData, expr)));
      stack.push({ type: 'if' });
      return `{{IF ${varName}}}`;
    });

    text = text.replace(forStartRe, (_m, exprRaw) => {
      const expr = String(exprRaw ?? '').trim();
      const varName = registerVar('for', expr, () => {
        const v = evaluateJsonPath(jsonData, expr);
        return Array.isArray(v) ? v : v == null ? [] : [v];
      });
      forDepth += 1;
      const itemVar = forDepth === 1 ? 'item' : `item${forDepth}`;
      stack.push({ type: 'for', itemVar });
      forMappings.push({ expr, itemVar });
      return `{{FOR ${itemVar} IN ${varName}}}`;
    });

    // End directives.
    text = text.replace(ifEndRe, () => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === 'if') {
          stack.splice(i, 1);
          break;
        }
      }
      return '{{END-IF}}';
    });

    text = text.replace(forEndRe, () => {
      let itemVar = 'item';
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === 'for') {
          itemVar = stack[i].itemVar;
          stack.splice(i, 1);
          break;
        }
      }
      return `{{END-FOR ${itemVar}}}`;
    });

    // Standalone brace end marker: "}" (common when writing directives in Word).
    if (text.trim() === '}') {
      const frame = stack.pop();
      if (frame?.type === 'if') return '{{END-IF}}';
      if (frame?.type === 'for') return `{{END-FOR ${frame.itemVar}}}`;
    }

    return text;
  });

  return out;
}
