// Plain-text template editor: a textarea with a synchronized highlight layer
// that colours {{commands}}, block commands and formulas.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { escapeHtml } from '../../../shared/html';

export interface EditorHandle {
  insert(text: string, wrap?: { before: string; after: string }): void;
  replaceRange(start: number, end: number, text: string): void;
  focus(): void;
}

function highlight(src: string) {
  return escapeHtml(src).replace(/\{\{[\s\S]*?\}\}/g, (m) => {
    const body = m.slice(2).trimStart();
    const cls = /^(if|elseif|else|endif|repeat|endrepeat|section|endsection)\b/i.test(body) ? 'blk' : /^(=|set\b)/.test(body) ? 'fx' : 'cmd';
    return `<span class="${cls}">${m}</span>`;
  }) + '\n';
}

export const CodeEditor = forwardRef<EditorHandle, { value: string; onChange: (v: string) => void; readOnly?: boolean; placeholder?: string }>(function CodeEditor({ value, onChange, readOnly, placeholder }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    insert(text, wrap) {
      const el = ta.current!;
      const s = el.selectionStart, e = el.selectionEnd;
      const sel = value.slice(s, e);
      const ins = wrap ? wrap.before + (sel || '…') + wrap.after : text;
      const next = value.slice(0, s) + ins + value.slice(e);
      onChange(next);
      requestAnimationFrame(() => { el.focus(); const p = s + ins.length; el.setSelectionRange(p, p); });
    },
    replaceRange(start, end, text) {
      onChange(value.slice(0, start) + text + value.slice(end));
    },
  }));
  const sync = () => { if (hl.current && ta.current) { hl.current.scrollTop = ta.current.scrollTop; hl.current.style.height = ta.current.offsetHeight + 'px'; } };
  return (
    <div className="code-wrap">
      <div className="hl" ref={hl} aria-hidden dangerouslySetInnerHTML={{ __html: highlight(value) }} />
      <textarea
        ref={ta}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onMouseUp={sync}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            onChange(value.slice(0, s) + '  ' + value.slice(el.selectionEnd));
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
        rows={14}
        aria-label="Snippet content"
      />
    </div>
  );
});
