import React from 'react';
import type { FormItem, FieldDef, RepeatItem } from '../engine/render';
import { Plus, X } from 'lucide-react';

interface Props {
  items: FormItem[];
  values: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  showErrors?: boolean;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
}

function Field({ f, value, onChange, showErrors, autoFocus, onSubmitShortcut }: { f: FieldDef; value: any; onChange: (v: any) => void; showErrors?: boolean; autoFocus?: boolean; onSubmitShortcut?: () => void }) {
  const id = React.useId();
  const invalid = showErrors && !!f.error;
  const cls = (base: string) => base + (invalid ? ' invalid' : '');
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (f.type !== 'textarea' && !e.shiftKey))) { e.preventDefault(); onSubmitShortcut?.(); }
  };
  const label = (
    <label className="label" htmlFor={id}>
      {f.label}
      {f.required && <span className="req">*</span>}
    </label>
  );
  let control: React.ReactNode;
  switch (f.type) {
    case 'textarea':
      control = <textarea id={id} className={cls('textarea')} rows={f.rows || 3} value={value ?? ''} placeholder={f.placeholder} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />;
      break;
    case 'select':
      control = f.multiple ? (
        <div className="row wrap">
          {(f.options || []).map((o) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            return (
              <label key={o} className="check">
                <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
                {o}
              </label>
            );
          })}
        </div>
      ) : (
        <select id={id} className={cls('select')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus}>
          {f.required && !value && <option value="">Choose…</option>}
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'pick':
      control = (
        <select id={id} className={cls('select')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus}>
          <option value="">Choose…</option>
          {(f.options || []).map((o) => { const [k, l] = o.split('\u0000'); return <option key={k} value={k}>{l}</option>; })}
        </select>
      );
      break;
    case 'checkbox':
    case 'section':
      return (
        <div className="field">
          <label className="check">
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} autoFocus={autoFocus} onKeyDown={onKey} />
            <span>{f.label}{f.required && <span className="req">*</span>}</span>
          </label>
          {f.hint && <div className="hint">{f.hint}</div>}
          {invalid && <div className="err">{f.error}</div>}
        </div>
      );
    case 'toggle':
      return (
        <div className="field row" style={{ justifyContent: 'space-between' }}>
          <span className="label" style={{ margin: 0 }}>{f.label}</span>
          <label className="switch">
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} autoFocus={autoFocus} onKeyDown={onKey} />
            <span />
          </label>
        </div>
      );
    case 'date':
      control = <input id={id} type="date" className={cls('input')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />;
      break;
    case 'time':
      control = <input id={id} type="time" className={cls('input')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />;
      break;
    case 'datetime':
      control = <input id={id} type="datetime-local" className={cls('input')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />;
      break;
    case 'number':
    case 'currency':
      control = (
        <div className="row">
          {f.type === 'currency' && <span className="badge">{f.currency || '¤'}</span>}
          <input id={id} type="number" inputMode="decimal" className={cls('input')} value={value ?? ''} min={f.min} max={f.max} step={f.step ?? (f.type === 'currency' ? 0.01 : 'any')} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />
        </div>
      );
      break;
    default:
      control = <input id={id} type="text" className={cls('input')} value={value ?? ''} placeholder={f.placeholder} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} />;
  }
  return (
    <div className="field">
      {label}
      {control}
      {f.hint && <div className="hint">{f.hint}</div>}
      {invalid && <div className="err">{f.error}</div>}
    </div>
  );
}

export function FormRenderer({ items, values, onChange, showErrors, autoFocus, onSubmitShortcut }: Props) {
  let focused = false;
  const af = () => { if (!autoFocus || focused) return false; focused = true; return true; };
  const renderRepeat = (r: RepeatItem) => {
    const rows: any[] = Array.isArray(values[r.name]) ? values[r.name] : r.rows.map(() => ({}));
    const setRow = (i: number, name: string, v: any) => {
      const next = rows.map((x) => ({ ...x }));
      while (next.length <= i) next.push({});
      next[i][name] = v;
      onChange({ ...values, [r.name]: next });
    };
    return (
      <div key={'rep-' + r.name} className={`repeat depth-${Math.min(2, r.depth)}`}>
        <div className="repeat-head">
          <span>{r.label}s</span>
          <button type="button" className="btn sm" disabled={rows.length >= r.max} onClick={() => onChange({ ...values, [r.name]: [...rows, {}] })}>
            <Plus size={14} /> Add {r.label.toLowerCase()}
          </button>
        </div>
        {r.rows.map((fields, i) => (
          <div className="repeat-row" key={i}>
            {rows.length > r.min && (
              <button type="button" className="btn ghost icon sm rm" title="Remove" onClick={() => onChange({ ...values, [r.name]: rows.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            )}
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>{r.label} {i + 1}</div>
            {fields.map((f) => (
              <Field key={f.name} f={f} value={f.value} onChange={(v) => setRow(i, f.name, v)} showErrors={showErrors} autoFocus={af()} onSubmitShortcut={onSubmitShortcut} />
            ))}
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="qform">
      {items.map((it) =>
        (it as RepeatItem).type === 'repeat' ? (
          renderRepeat(it as RepeatItem)
        ) : (
          <div key={(it as FieldDef).name} className={`depth-${Math.min(2, it.depth)}`}>
            <Field f={it as FieldDef} value={(it as FieldDef).value} onChange={(v) => onChange({ ...values, [(it as FieldDef).name]: v })} showErrors={showErrors} autoFocus={af()} onSubmitShortcut={onSubmitShortcut} />
          </div>
        ),
      )}
    </div>
  );
}

export function hasErrors(items: FormItem[]): boolean {
  return items.some((it) => ((it as RepeatItem).type === 'repeat' ? (it as RepeatItem).rows.some((r) => r.some((f) => f.error)) : !!(it as FieldDef).error));
}
