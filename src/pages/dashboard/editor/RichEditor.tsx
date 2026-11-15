// Rich-text editor (contenteditable + toolbar). Output is sanitized HTML; template
// commands are typed as plain text inside the content.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, Eraser, Heading2, Quote } from 'lucide-react';
import { sanitizeHtml } from '../../../shared/html';
import type { EditorHandle } from './CodeEditor';

export const RichEditor = forwardRef<EditorHandle, { value: string; onChange: (v: string) => void; readOnly?: boolean }>(function RichEditor({ value, onChange, readOnly }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  useEffect(() => {
    if (el.current && el.current.innerHTML !== value) el.current.innerHTML = value;
  }, [value]);
  const emit = () => el.current && onChange(sanitizeHtml(el.current.innerHTML));
  const saveRange = () => {
    const s = document.getSelection();
    if (s?.rangeCount && el.current?.contains(s.anchorNode)) lastRange.current = s.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    el.current?.focus();
    if (lastRange.current) { const s = document.getSelection(); s?.removeAllRanges(); s?.addRange(lastRange.current); }
  };
  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    insert(text, wrap) {
      restore();
      const sel = document.getSelection()?.toString() || '';
      document.execCommand('insertText', false, wrap ? wrap.before + (sel || '…') + wrap.after : text);
      emit();
    },
    replaceRange(start, end, text) {
      onChange(value.slice(0, start) + text + value.slice(end));
    },
  }));
  const cmd = (c: string, v?: string) => { restore(); document.execCommand(c, false, v); emit(); };
  const tool = (icon: React.ReactNode, title: string, run: () => void) => (
    <button type="button" className="btn ghost icon sm" title={title} onMouseDown={(e) => { e.preventDefault(); run(); }}>{icon}</button>
  );
  return (
    <div>
      {!readOnly && (
        <div className="toolbar">
          {tool(<Bold size={15} />, 'Bold', () => cmd('bold'))}
          {tool(<Italic size={15} />, 'Italic', () => cmd('italic'))}
          {tool(<Underline size={15} />, 'Underline', () => cmd('underline'))}
          {tool(<Strikethrough size={15} />, 'Strikethrough', () => cmd('strikeThrough'))}
          {tool(<Heading2 size={15} />, 'Heading', () => cmd('formatBlock', 'h3'))}
          {tool(<Quote size={15} />, 'Quote', () => cmd('formatBlock', 'blockquote'))}
          {tool(<List size={15} />, 'Bullet list', () => cmd('insertUnorderedList'))}
          {tool(<ListOrdered size={15} />, 'Numbered list', () => cmd('insertOrderedList'))}
          {tool(<Link2 size={15} />, 'Link', () => { const u = prompt('Link URL (https://…)'); if (u && /^(https?:|mailto:|tel:)/i.test(u)) cmd('createLink', u); })}
          {tool(<Eraser size={15} />, 'Clear formatting', () => { cmd('removeFormat'); cmd('formatBlock', 'div'); })}
        </div>
      )}
      <div
        ref={el}
        className="rich"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder="Write your rich snippet… use Insert to add fields and commands."
        onInput={emit}
        onBlur={() => { saveRange(); emit(); }}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
          else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          emit();
        }}
      />
    </div>
  );
});
