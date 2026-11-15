import React, { useEffect } from 'react';
import { X, Lock } from 'lucide-react';
import { useStore } from './store';
import { FEATURE_LABELS, type Feature } from '../../shared/plans';

export function Modal({ title, onClose, children, footer, width = 560 }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card fade-in" style={{ width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={440} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className={'btn ' + (danger ? 'danger solid' : 'primary')} autoFocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
    </>}>
      <div>{message}</div>
    </Modal>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className="row" style={{ gap: 10, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span className="switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <span />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-ic">{icon}</div>}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function PlanGate({ feature, children, inline }: { feature: Feature; children: React.ReactNode; inline?: boolean }) {
  const { can, settings } = useStore();
  if (can(feature)) return <>{children}</>;
  const msg = (
    <span>
      <Lock size={13} /> <b>{FEATURE_LABELS[feature]}</b> is not included in the {settings.plan[0].toUpperCase() + settings.plan.slice(1)} plan. <a href="#/settings?tab=plan">Change plan</a>
    </span>
  );
  return inline ? <div className="badge warn">{msg}</div> : <div className="card locked">{msg}</div>;
}

export function Section({ title, desc, children, right }: { title: string; desc?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card section">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          {desc && <div className="muted" style={{ fontSize: 13 }}>{desc}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export const timeAgo = (t: number) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
};
