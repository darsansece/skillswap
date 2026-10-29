import React, { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: '2rem', margin: '1rem 0', textAlign: 'center' }}>
          <h3>Something went wrong</h3>
          <p className="muted small">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button className="btn small" style={{ marginTop: '1rem' }} onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Coin = ({ value, big, className = '' }) => <span className={`coin ${big ? 'big' : ''} ${className}`} aria-label={`${value} credits`}>{value}</span>;

export function Avatar({ user, size }) {
  const name = user?.name || '?';
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} aria-hidden="true">
      {user?.avatar ? <img src={user.avatar} alt="" /> : name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
    </span>
  );
}

export const Stars = ({ value = 0, count }) => (
  <span className="small" title={`${value} out of 5`}>
    <span className="stars" aria-hidden="true">{'★★★★★'.slice(0, Math.round(value))}{'☆☆☆☆☆'.slice(0, 5 - Math.round(value))}</span>
    {' '}{value ? value.toFixed(1) : 'New'}{count !== undefined && count > 0 ? <span className="muted"> ({count})</span> : null}
  </span>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }) => (error ? <div className="error" role="alert">{error}</div> : null);
export const Loading = () => <p className="muted">Loading…</p>;

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button></div>
        <div style={{ marginTop: '1rem' }}>{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
      <button className="btn ghost small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small muted">Page {page} of {pages}</span>
      <button className="btn ghost small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/** Generic data loader hook. */
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true }));
    try { const { data } = await api.get(url); setState({ data, loading: false, error: null }); }
    catch (e) { setState({ data: null, loading: false, error: errMsg(e) }); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [url, ...deps]);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function ReportButton({ targetType, targetId, label = 'Report' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const toast = useToast();
  const submit = async () => {
    try { await api.post('/reports', { targetType, targetId, reason, details }); toast('Report sent to moderators'); setOpen(false); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <>
      <button className="btn link small" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title="Report this content" onClose={() => setOpen(false)}>
          <div className="field"><label htmlFor="rr">Reason</label>
            <select id="rr" value={reason} onChange={(e) => setReason(e.target.value)}>
              {['spam', 'harassment', 'inappropriate', 'fraud', 'misinformation', 'other'].map((r) => <option key={r}>{r}</option>)}
            </select></div>
          <div className="field"><label htmlFor="rd">Details (optional)</label><textarea id="rd" value={details} onChange={(e) => setDetails(e.target.value)} /></div>
          <button className="btn danger" onClick={submit}>Send report</button>
        </Modal>
      )}
    </>
  );
}

export const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
export const timeAgo = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
