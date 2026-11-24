import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

/** Fetch helper: const { data, loading, error, reload, setData } = useFetch('/url') */
export function useFetch(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    try { setData(await api.get(url)); setError(''); } catch (e) { setError(e.message); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

export const toast = (message, type = 'ok') => window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
export const toastErr = (e) => toast(e?.message || String(e), 'error');

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random();
      setItems((x) => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
    };
    window.addEventListener('toast', h);
    return () => window.removeEventListener('toast', h);
  }, []);
  return <div className="toaster" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>;
}

// SQLite timestamps ("YYYY-MM-DD HH:MM:SS") are UTC; "YYYY-MM-DDTHH:MM" values come from datetime-local inputs (local time).
export const parseDate = (s) => (!s ? null : /Z|[+-]\d\d:?\d\d$/.test(s) || s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T') + 'Z'));
export const fmtDate = (s, withTime = false) => {
  const d = parseDate(s); if (!d || isNaN(d)) return '—';
  return d.toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
export const timeAgo = (s) => {
  const d = parseDate(s); if (!d) return '';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(s);
};

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide === 'x' ? 'wide xwide' : wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const STATUS_TONE = {
  approved: 'good', active: 'good', completed: 'good', accepted: 'good', published: 'good', passed: 'good',
  pending: 'warn', submitted: 'info', under_review: 'info', internal_review: 'info', scheduled: 'info', ready: 'info', drafting: 'muted',
  corrections: 'serious', needs_revision: 'serious', revision: 'serious', 'Make corrections': 'serious',
  rejected: 'bad', suspended: 'bad', failed: 'bad', cancelled: 'muted', deactivated: 'bad', inactive: 'bad', archived: 'muted',
};
export const Badge = ({ children, tone }) => {
  const t = tone || STATUS_TONE[children] || 'muted';
  return <span className={`badge ${t}`}>{String(children ?? '').replace(/_/g, ' ')}</span>;
};

export const Stat = ({ label, value, hint, onClick }) => (
  <div className={`stat ${onClick ? 'clickable' : ''}`} onClick={onClick}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value ?? '—'}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

/** Single-series horizontal bars (one brand hue), value labels in text ink, hover tooltip via title. */
export function BarList({ items, unit = '', empty = 'No data yet' }) {
  if (!items?.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="barlist" role="table">
      {items.map((i) => (
        <div className="bar-row" key={i.label} role="row" title={`${i.label}: ${i.value}${unit}`}>
          <div className="bar-label" role="cell">{i.label}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} /></div>
          <div className="bar-value" role="cell">{i.value}{unit}</div>
        </div>
      ))}
    </div>
  );
}

/** Vertical column chart for a short time series (single series). */
export function Columns({ items }) {
  if (!items?.length) return <Empty>No activity recorded</Empty>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="columns">
      {items.map((i) => (
        <div className="col" key={i.label} title={`${i.label}: ${i.value}`}>
          <div className="col-bar-wrap"><div className="col-bar" style={{ height: `${Math.max(3, (i.value / max) * 100)}%` }} /></div>
          <div className="col-label">{i.short || i.label}</div>
        </div>
      ))}
    </div>
  );
}

export const Progress = ({ value }) => (
  <div className="progress" title={`${value}% complete`} aria-label={`${value}% complete`}><div style={{ width: `${value}%` }} /><span>{value}%</span></div>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="loading"><span className="spinner" /> Loading…</div>;
export const ErrorBox = ({ children }) => (children ? <div className="error-box">{children}</div> : null);

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Confirm({ text, onYes, onClose, yes = 'Confirm', danger }) {
  return (
    <Modal title="Please confirm" onClose={onClose}>
      <p>{text}</p>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : ''}`} onClick={async () => { await onYes(); onClose(); }}>{yes}</button></div>
    </Modal>
  );
}

/**
 * Search + per-field filters for any table/list.
 *   const t = useTableControls(rows, {
 *     search: ['name', 'email', (r) => r.dept],           // keys or getters searched as free text
 *     filters: [{ key: 'role', label: 'Role', get: (r) => r.role, format: (v) => ROLE_LABEL[v] },
 *               { key: 'date', label: 'Date', type: 'date', get: (r) => r.created_at }],
 *     initial: { role: 'student' },
 *   });
 *   <TableControls {...t} />  …  t.rows.map(…)
 * Dropdown options are derived from the data (with counts); empty values appear as "— None —".
 */
const NONE = '__none';
export function useTableControls(rows, { search = [], filters = [], initial = {}, placeholder = 'Search…', pageSize: defaultSize = 25 } = {}) {
  const [query, setQueryRaw] = useState('');
  const [values, setValues] = useState(initial);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultSize);
  const list = rows || [];
  const norm = (v) => (v === null || v === undefined || v === '' ? NONE : String(v));
  const asArray = (v) => (Array.isArray(v) ? (v.length ? v : [null]) : [v]);

  const options = {};
  for (const f of filters) {
    if (f.type === 'date') continue;
    const counts = new Map();
    for (const r of list) for (const v of asArray(f.get(r))) counts.set(norm(v), (counts.get(norm(v)) || 0) + 1);
    options[f.key] = [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: value === NONE ? (f.noneLabel || '— None —') : f.format ? f.format(value) : value }))
      .sort(f.sort || ((a, b) => (a.value === NONE) - (b.value === NONE) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true })));
  }

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = list.filter((r) => {
    if (tokens.length) {
      const hay = search.map((s) => (typeof s === 'function' ? s(r) : r[s])).filter((x) => x !== null && x !== undefined).join(' ').toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    for (const f of filters) {
      const v = values[f.key];
      if (f.type === 'date') {
        const d = String(f.get(r) || '').slice(0, 10);
        if (v?.from && (!d || d < v.from)) return false;
        if (v?.to && (!d || d > v.to)) return false;
      } else if (v && !asArray(f.get(r)).some((x) => norm(x) === v)) return false;
    }
    return true;
  });

  const active = (query ? 1 : 0) + filters.filter((f) => (f.type === 'date' ? values[f.key]?.from || values[f.key]?.to : values[f.key])).length;
  // Pagination: `rows` is the current page; `allRows` is every match (use it for exports, totals and printing).
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize), allRows: filtered, start, page: current, pages, pageSize,
    setPage: (p) => setPage(Math.max(1, Math.min(pages, p))),
    setPageSize: (n) => { setPageSizeRaw(n); setPage(1); },
    total: list.length, count: filtered.length, active, query, values, filters, options, placeholder,
    setQuery: (v) => { setQueryRaw(v); setPage(1); },
    setValue: (k, v) => { setValues((s) => ({ ...s, [k]: v })); setPage(1); },
    reset: () => { setQueryRaw(''); setValues({}); setPage(1); },
  };
}

/** Page navigation for a useTableControls result. Hidden when everything fits on one page of the smallest size. */
export function Pagination({ page, pages, setPage, pageSize, setPageSize, start, count }) {
  if (count <= 10) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums.at(-1) !== '…') nums.push('…');
  return (
    <nav className="pagination" aria-label="Table pages">
      <small className="muted">Showing {start + 1}–{Math.min(start + pageSize, count)} of {count}</small>
      <label className="pg-size">Rows per page
        <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
      {pages > 1 && (
        <div className="pg-buttons">
          <button type="button" onClick={() => setPage(1)} disabled={page === 1} aria-label="First page">«</button>
          <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
          {nums.map((n, i) => (n === '…' ? <span key={`e${i}`} className="pg-gap">…</span>
            : <button type="button" key={n} className={n === page ? 'active' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>))}
          <button type="button" onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Next page">›</button>
          <button type="button" onClick={() => setPage(pages)} disabled={page === pages} aria-label="Last page">»</button>
        </div>
      )}
    </nav>
  );
}

export function TableControls({ query, setQuery, values, setValue, filters, options, placeholder, count, total, active, reset, children }) {
  const [open, setOpen] = useState(false);
  const filterCount = active - (query ? 1 : 0);
  return (
    <div className="table-controls" role="search">
      <div className="tc-search">
        <span aria-hidden="true">🔍</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search table" />
      </div>
      {filters.length > 0 && (
        <button type="button" className="btn ghost sm tc-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          Filters{filterCount > 0 ? ` (${filterCount})` : ''} {open ? '▲' : '▼'}
        </button>
      )}
      <div className={`tc-filters ${open ? 'open' : ''}`}>
      {filters.map((f) => (f.type === 'date' ? (
        <div key={f.key} className="tc-date" title={f.label}>
          <span>{f.label}</span>
          <input type="date" value={values[f.key]?.from || ''} onChange={(e) => setValue(f.key, { ...values[f.key], from: e.target.value })} aria-label={`${f.label} from`} />
          <span>–</span>
          <input type="date" value={values[f.key]?.to || ''} onChange={(e) => setValue(f.key, { ...values[f.key], to: e.target.value })} aria-label={`${f.label} to`} />
        </div>
      ) : (
        <select key={f.key} value={values[f.key] || ''} onChange={(e) => setValue(f.key, e.target.value)} aria-label={f.label} className={values[f.key] ? 'tc-on' : ''}>
          <option value="">{f.label}: All</option>
          {options[f.key].map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
          {values[f.key] && !options[f.key].some((o) => o.value === values[f.key]) && <option value={values[f.key]}>(no matches)</option>}
        </select>
      )))}
      </div>
      {children}
      <div className="tc-meta">
        <small className="muted">{count === total ? `${total} record${total === 1 ? '' : 's'}` : `${count} of ${total}`}</small>
        {active > 0 && <button type="button" className="btn ghost sm" onClick={reset}>Clear ({active})</button>}
      </div>
    </div>
  );
}

/** Cascading faculty → department → programme selects backed by the public catalogue. */
export function useCatalog() {
  const [cat, setCat] = useState({ faculties: [], departments: [], programs: [] });
  useEffect(() => { api.get('/auth/catalog').then(setCat).catch(() => {}); }, []);
  return cat;
}
