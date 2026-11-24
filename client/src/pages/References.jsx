import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';
import { REF_TYPES, STYLES, bibliography, formatRef, inText } from '../cite.js';

const blank = { type: 'journal', authors: '', year: '', title: '', source: '', volume: '', issue: '', pages: '', publisher: '', place: '', url: '', doi: '', accessed: '' };

export default function References() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, reload } = useFetch(`/references${showArchived ? '?archived=1' : ''}`);
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('cite_style') || 'apa'; } catch { return 'apa'; } });
  const [edit, setEdit] = useState(null);
  const changeStyle = (s) => { setStyle(s); try { localStorage.setItem('cite_style', s); } catch { /* ignore */ } };
  const t = useTableControls(data, {
    placeholder: 'Search authors, title, journal, DOI…',
    search: ['authors', 'title', 'source', 'year', 'publisher', 'doi', 'url'],
    filters: [
      { key: 'type', label: 'Type', get: (r) => r.type, format: (v) => REF_TYPES.find((x) => x.key === v)?.label || v },
      { key: 'year', label: 'Year', get: (r) => r.year, sort: (a, b) => String(b.value).localeCompare(String(a.value)) },
      { key: 'source', label: 'Journal / source', get: (r) => r.source },
      { key: 'publisher', label: 'Publisher', get: (r) => r.publisher },
      { key: 'doi', label: 'DOI', get: (r) => (r.doi ? 'Has DOI' : 'No DOI') },
      { key: 'added', label: 'Added', type: 'date', get: (r) => r.created_at },
    ],
  });
  const rows = t.rows;
  const copy = async (html) => {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tmp.innerText], { type: 'text/plain' }) })]);
    } catch { await navigator.clipboard.writeText(tmp.innerText); }
    toast('Copied to clipboard');
  };
  return (
    <div>
      <PageHead title="Reference Manager" sub="Store your sources once and cite them in any style">
        <select value={style} onChange={(e) => changeStyle(e.target.value)} aria-label="Citation style">{STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <button className="btn ghost" disabled={!t.count} onClick={() => copy(bibliography(t.allRows, style).map((b) => `<p>${b}</p>`).join(''))}>Copy reference list</button>
        <button className="btn" onClick={() => setEdit({ ...blank })}>+ Add reference</button>
      </PageHead>
      <div className="grid-side">
        <div className="card">
          <TableControls {...t}><label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived</label></TableControls>
          {loading ? <Loading /> : !rows.length ? <Empty>{t.total ? 'No references match your search or filters.' : showArchived ? 'No archived references.' : 'No references yet. Add one manually or look it up by DOI.'}</Empty> : (
            <ul className="ref-list">{rows.map((r, i) => (
              <li key={r.id}>
                <div dangerouslySetInnerHTML={{ __html: formatRef(r, style, t.start + i + 1) }} />
                <div className="row gap wrap">
                  <small className="muted">In-text: <code>{inText(r, style, t.start + i + 1)}</code></small>
                  <button className="btn ghost sm" onClick={() => copy(formatRef(r, style, t.start + i + 1))}>Copy</button>
                  <button className="btn ghost sm" onClick={() => setEdit(r)}>Edit</button>
                  {showArchived
                    ? <button className="btn sm" onClick={async () => { try { await api.post(`/references/${r.id}/restore`); toast('Reference restored'); reload(); } catch (e) { toastErr(e); } }}>Restore</button>
                    : <button className="btn ghost sm" onClick={async () => { try { await api.post(`/references/${r.id}/archive`); toast('Reference archived'); reload(); } catch (e) { toastErr(e); } }}>Archive</button>}
                </div>
              </li>
            ))}</ul>
          )}
          {!loading && (
            <Pagination {...t} />
          )}
        </div>
        <div className="card">
          <h3>Learn referencing</h3>
          <ul className="checklist">
            <li><b>APA 7th</b> — author–date; reference list alphabetical; most common in sciences, education and social sciences.</li>
            <li><b>Harvard</b> — author–date like APA with slightly different punctuation.</li>
            <li><b>IEEE</b> — numbered [1] in order of citation; engineering and computing.</li>
            <li><b>MLA</b> — author–page; humanities and languages.</li>
            <li><b>Chicago</b> — author–date or notes; history and some social sciences.</li>
          </ul>
          <p className="muted small">Always confirm which style your department requires.</p>
          <Link className="btn ghost block" to="/resources">Referencing guides & PDFs →</Link>
        </div>
      </div>
      {edit && <RefModal r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function RefModal({ r, onClose, onSaved }) {
  const [f, setF] = useState({ ...blank, ...r });
  const [doi, setDoi] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const lookup = async () => {
    setBusy(true);
    try { setF({ ...f, ...(await api.get(`/references/lookup/doi?doi=${encodeURIComponent(doi)}`)) }); toast('Details filled from Crossref — please verify'); } catch (e) { toastErr(e); }
    setBusy(false);
  };
  const save = async () => {
    try { if (r.id) await api.put(`/references/${r.id}`, f); else await api.post('/references', f); onSaved(); } catch (e) { toastErr(e); }
  };
  const book = ['book', 'report', 'thesis'].includes(f.type);
  return (
    <Modal title={r.id ? 'Edit reference' : 'Add reference'} onClose={onClose} wide>
      {!r.id && (
        <div className="row gap doi-row">
          <input placeholder="Look up by DOI, e.g. 10.1038/nature12373" value={doi} onChange={(e) => setDoi(e.target.value)} />
          <button className="btn ghost" disabled={!doi || busy} onClick={lookup}>{busy ? 'Looking up…' : 'Fetch details'}</button>
        </div>
      )}
      <div className="grid2">
        <Field label="Type"><select value={f.type} onChange={set('type')}>{REF_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <Field label="Year"><input value={f.year} onChange={set('year')} /></Field>
        <div className="span2"><Field label="Authors" hint="One per line or separated by ';' — format: Surname, Given names"><textarea rows={2} value={f.authors} onChange={set('authors')} placeholder="Okoro, Chinedu A.; Musa, Aisha" /></Field></div>
        <div className="span2"><Field label="Title"><input value={f.title} onChange={set('title')} /></Field></div>
        <Field label={book ? 'Series / container (optional)' : f.type === 'web' ? 'Website name' : f.type === 'chapter' ? 'Book title' : 'Journal / conference'}><input value={f.source} onChange={set('source')} /></Field>
        <Field label="Publisher / institution"><input value={f.publisher} onChange={set('publisher')} /></Field>
        {!book && f.type !== 'web' && (<><Field label="Volume"><input value={f.volume} onChange={set('volume')} /></Field><Field label="Issue"><input value={f.issue} onChange={set('issue')} /></Field></>)}
        <Field label="Pages"><input value={f.pages} onChange={set('pages')} placeholder="45–60" /></Field>
        <Field label="Place of publication"><input value={f.place} onChange={set('place')} /></Field>
        <Field label="DOI"><input value={f.doi} onChange={set('doi')} /></Field>
        <Field label="URL"><input value={f.url} onChange={set('url')} /></Field>
        {f.type === 'web' && <Field label="Date accessed"><input value={f.accessed} onChange={set('accessed')} placeholder="24 November 2026" /></Field>}
      </div>
      <div className="preview-cite"><small className="muted">Preview (APA)</small><div dangerouslySetInnerHTML={{ __html: formatRef(f, 'apa') }} /></div>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></div>
    </Modal>
  );
}
