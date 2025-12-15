import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const templateId = id!;

  const [name, setName] = React.useState<string>('Template');
  const [editorHtml, setEditorHtml] = React.useState<string>('');
  const [tokenIds, setTokenIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const activeTokenElRef = React.useRef<HTMLSpanElement | null>(null);

  async function reload() {
    setError(null);
    try {
      const e = await apiGet<{ html: string; name: string; tokenIds: string[] }>(`/api/templates/${templateId}/editor`);
      setName(e.name);
      setEditorHtml(e.html);
      setTokenIds(e.tokenIds ?? []);
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
    for (const t of tokenIds) tokens[t] = '';
    spans.forEach((s) => {
      const token = s.dataset.token;
      if (!token) return;
      const part = s.innerText ?? '';
      tokens[token] = tokens[token] === undefined ? part : `${tokens[token]}\n${part}`;
    });
    return tokens;
  }

  function setActiveToken(el: HTMLSpanElement | null) {
    activeTokenElRef.current = el;
  }

  function normalizeEditorLayout() {
    const root = document.getElementById('tpl-editor');
    if (!root) return;
    // Remove stray empty <br> at end of blocks.
    root.querySelectorAll('br').forEach((br) => {
      const next = br.nextSibling;
      if (!next) br.remove();
    });
  }

  function deleteActiveTokenLine() {
    const el = activeTokenElRef.current;
    if (!el) return;
    const br = el.previousSibling?.nodeName === 'BR' ? (el.previousSibling as HTMLBRElement) : null;
    const nextBr = el.nextSibling?.nodeName === 'BR' ? (el.nextSibling as HTMLBRElement) : null;
    const nextToken =
      el.nextSibling && (el.nextSibling as HTMLElement).nodeType === Node.ELEMENT_NODE
        ? (el.nextSibling as HTMLElement).closest?.('span.tpl-token[data-token]')
        : null;
    const prevToken =
      el.previousSibling && (el.previousSibling as HTMLElement).nodeType === Node.ELEMENT_NODE
        ? (el.previousSibling as HTMLElement).closest?.('span.tpl-token[data-token]')
        : null;

    el.remove();
    br?.remove();
    nextBr?.remove();
    normalizeEditorLayout();

    const focusTarget = (nextToken as HTMLSpanElement | null) ?? (prevToken as HTMLSpanElement | null);
    if (focusTarget) {
      focusTarget.focus();
      setActiveToken(focusTarget);
    } else {
      setActiveToken(null);
    }
  }

  function mergeWithSibling(direction: 'prev' | 'next') {
    const el = activeTokenElRef.current;
    if (!el) return;
    const token = el.dataset.token;
    if (!token) return;

    let other: HTMLSpanElement | null = null;
    let betweenBr: HTMLBRElement | null = null;

    if (direction === 'next') {
      const br = el.nextSibling?.nodeName === 'BR' ? (el.nextSibling as HTMLBRElement) : null;
      const next = br?.nextSibling as HTMLElement | null;
      const nextTokenEl = next?.closest?.('span.tpl-token[data-token]') as HTMLSpanElement | null;
      if (br && nextTokenEl && nextTokenEl.dataset.token === token) {
        other = nextTokenEl;
        betweenBr = br;
      }
    } else {
      const br = el.previousSibling?.nodeName === 'BR' ? (el.previousSibling as HTMLBRElement) : null;
      const prev = br?.previousSibling as HTMLElement | null;
      const prevTokenEl = prev?.closest?.('span.tpl-token[data-token]') as HTMLSpanElement | null;
      if (br && prevTokenEl && prevTokenEl.dataset.token === token) {
        other = prevTokenEl;
        betweenBr = br;
      }
    }

    if (!other || !betweenBr) return;

    const left = direction === 'prev' ? other : el;
    const right = direction === 'prev' ? el : other;

    const a = left.innerText ?? '';
    const b = right.innerText ?? '';
    const joiner = a.length > 0 && b.length > 0 ? ' ' : '';
    left.innerText = `${a}${joiner}${b}`;
    betweenBr.remove();
    right.remove();
    left.focus();
    setActiveToken(left);
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
          <button className="secondary" onClick={deleteActiveTokenLine} disabled={busy}>
            Delete line
          </button>
          <button className="secondary" onClick={() => mergeWithSibling('prev')} disabled={busy}>
            Merge prev
          </button>
          <button className="secondary" onClick={() => mergeWithSibling('next')} disabled={busy}>
            Merge next
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
          <span className="mono"> @for ($.myArray) {'{'} ... @endfor</span> (or put <span className="mono">{'}'}</span> as
          a standalone cell/paragraph to close).
          <div style={{ marginTop: 6 }}>
            Tables: put <span className="mono">@for ($.rows) {'{'}</span> in the first cell of the row you want to repeat,
            and <span className="mono">@endfor</span> (or a standalone <span className="mono">{'}'}</span>) in the first
            cell of the row that ends the loop.
          </div>
        </div>
      </div>

      <div className="spacer" />
      <div
        id="tpl-editor"
        className="doc-preview"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const tokenEl = (e.target as HTMLElement | null)?.closest?.('span.tpl-token[data-token]') as
            | HTMLSpanElement
            | null;
          if (!tokenEl) return;

          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          const range = selection.getRangeAt(0);
          if (!tokenEl.contains(range.startContainer)) return;

          const full = tokenEl.innerText ?? '';
          const pre = range.cloneRange();
          pre.selectNodeContents(tokenEl);
          pre.setEnd(range.startContainer, range.startOffset);
          const caretIndex = pre.toString().length;

          const before = full.slice(0, caretIndex);
          const after = full.slice(caretIndex);

          tokenEl.innerText = before;

          const br = document.createElement('br');
          const newSpan = document.createElement('span');
          newSpan.className = 'tpl-token';
          newSpan.dataset.token = tokenEl.dataset.token ?? '';
          newSpan.contentEditable = 'true';
          newSpan.innerText = after;

          tokenEl.insertAdjacentElement('afterend', br);
          br.insertAdjacentElement('afterend', newSpan);

          const textNode = newSpan.firstChild ?? newSpan;
          const newRange = document.createRange();
          newRange.setStart(textNode, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }}
        onFocusCapture={(e) => {
          const el = (e.target as HTMLElement | null)?.closest?.('span.tpl-token[data-token]') as HTMLSpanElement | null;
          setActiveToken(el);
        }}
        onMouseDown={(e) => {
          const el = (e.target as HTMLElement | null)?.closest?.('span.tpl-token[data-token]') as HTMLSpanElement | null;
          setActiveToken(el);
        }}
        dangerouslySetInnerHTML={{ __html: editorHtml }}
        suppressContentEditableWarning
      />
    </div>
  );
}
