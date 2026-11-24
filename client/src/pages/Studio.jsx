import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Field, Loading, Modal, Tabs, timeAgo, toast, toastErr, Confirm } from '../components/ui.jsx';
import { STYLES, bibliography, formatRef, inText } from '../cite.js';

const SKELETONS = {
  chapter1: ['CHAPTER ONE', 'INTRODUCTION', ['Background of the Study', 'Statement of the Problem', 'Aim and Objectives of the Study', 'Research Questions', 'Significance of the Study', 'Scope and Limitations of the Study', 'Definition of Terms']],
  chapter2: ['CHAPTER TWO', 'LITERATURE REVIEW', ['Introduction', 'Conceptual Framework', 'Theoretical Framework', 'Review of Related Empirical Studies', 'Summary of Literature Reviewed']],
  chapter3: ['CHAPTER THREE', 'RESEARCH METHODOLOGY', ['Introduction', 'Research Design', 'Population of the Study', 'Sample and Sampling Technique', 'Instruments for Data Collection', 'Validity and Reliability of the Instrument', 'Method of Data Analysis']],
  chapter4: ['CHAPTER FOUR', 'RESULTS AND DISCUSSION', ['Introduction', 'Data Presentation and Analysis', 'Test of Hypotheses', 'Discussion of Findings']],
  chapter5: ['CHAPTER FIVE', 'SUMMARY, CONCLUSION AND RECOMMENDATIONS', ['Summary', 'Conclusion', 'Recommendations', 'Contribution to Knowledge', 'Suggestions for Further Studies']],
  proposal: ['RESEARCH PROPOSAL', '', ['Title', 'Background', 'Statement of the Problem', 'Aim and Objectives', 'Research Questions / Hypotheses', 'Brief Literature Review', 'Methodology', 'Expected Contribution to Knowledge', 'Work Plan', 'References']],
  article: ['', 'TITLE OF ARTICLE', ['Abstract', 'Introduction', 'Literature Review', 'Materials and Methods', 'Results', 'Discussion', 'Conclusion', 'References']],
};
const skeletonHtml = (k) => {
  const [a, b, secs] = SKELETONS[k];
  const n = { chapter1: 1, chapter2: 2, chapter3: 3, chapter4: 4, chapter5: 5 }[k];
  return `${a ? `<h1>${a}</h1>` : ''}${b ? `<h1>${b}</h1>` : ''}${secs.map((s, i) => `<h2>${n ? `${n}.${i + 1} ` : ''}${s}</h2><p>Write here…</p>`).join('')}`;
};

const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Garamond', 'Courier New'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const { feature } = useAuth();
  const [docs, setDocs] = useState(null);
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState('check');
  const [stats, setStats] = useState({ words: 0, chars: 0, paras: 0 });
  const [outline, setOutline] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const ed = useRef(null);
  const range = useRef(null);
  const dirty = useRef(false);
  const fileIn = useRef(null);
  const imgIn = useRef(null);

  const loadDocs = useCallback(() => api.get('/documents').then(setDocs).catch(toastErr), []);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  const [archived, setArchived] = useState([]);
  const loadArchived = useCallback(() => api.get('/documents?archived=1').then(setArchived).catch(() => {}), []);
  useEffect(() => { loadArchived(); }, [loadArchived]);
  const restoreDoc = async (d) => { try { await api.post(`/documents/${d.id}/restore`); toast(`"${d.title}" restored`); loadDocs(); loadArchived(); } catch (e) { toastErr(e); } };
  useEffect(() => {
    if (!id) { setDoc(null); return; }
    api.get(`/documents/${id}`).then((d) => { setDoc(d); setTitle(d.title); }).catch((e) => { toastErr(e); nav('/studio'); });
  }, [id, nav]);
  useEffect(() => {
    if (doc && ed.current) { ed.current.innerHTML = doc.content_html || '<p><br></p>'; refreshStats(); dirty.current = false; setStatus('Saved'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const save = useCallback(async () => {
    if (!doc || !ed.current) return;
    setStatus('Saving…');
    try { await api.put(`/documents/${doc.id}`, { title, content_html: ed.current.innerHTML }); dirty.current = false; setStatus('Saved'); loadDocs(); } catch (e) { setStatus('Save failed'); toastErr(e); }
  }, [doc, title, loadDocs]);

  // Autosave 2s after the last change
  useEffect(() => {
    const t = setInterval(() => { if (dirty.current) save(); }, 2500);
    return () => clearInterval(t);
  }, [save]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection();
      if (s.rangeCount && ed.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  function refreshStats() {
    const el = ed.current; if (!el) return;
    const text = el.innerText || '';
    setStats({ words: (text.match(/\S+/g) || []).length, chars: text.replace(/\s/g, '').length, paras: el.querySelectorAll('p').length });
    setOutline([...el.querySelectorAll('h1,h2,h3')].map((h, i) => ({ i, lvl: +h.tagName[1], text: h.innerText.trim() })).filter((h) => h.text));
  }
  const changed = () => { dirty.current = true; setStatus('Unsaved changes'); refreshStats(); };

  const restore = () => {
    ed.current?.focus();
    if (range.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range.current); }
  };
  const exec = (cmd, val = null) => { restore(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); changed(); };
  const insertHTML = (html) => { restore(); document.execCommand('insertHTML', false, html); changed(); };

  const selectedBlocks = () => {
    restore();
    const s = window.getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    const blocks = [...ed.current.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,div')].filter((b) => r.intersectsNode(b));
    if (!blocks.length) { let n = r.startContainer; while (n && n !== ed.current && !(n.nodeType === 1 && /^(P|H\d|LI|DIV|BLOCKQUOTE)$/.test(n.tagName))) n = n.parentNode; if (n && n !== ed.current) blocks.push(n); }
    return blocks;
  };
  const lineSpacing = (v) => { selectedBlocks().forEach((b) => { b.style.lineHeight = v; }); changed(); };
  const fontSize = (pt) => {
    exec('fontSize', '7');
    ed.current.querySelectorAll('font[size="7"]').forEach((f) => { const sp = document.createElement('span'); sp.style.fontSize = `${pt}pt`; sp.innerHTML = f.innerHTML; f.replaceWith(sp); });
    ed.current.querySelectorAll('span[style*="xxx-large"]').forEach((sp) => { sp.style.fontSize = `${pt}pt`; });
    changed();
  };

  /** Automated formatting: renumber headings, upper-case chapter titles, justify body, remove empty paragraphs. */
  const autoFormat = (opts) => {
    const el = ed.current;
    let ch = 0, sec = 0, sub = 0;
    const WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
    el.querySelectorAll('h1,h2,h3').forEach((h) => {
      const txt = h.innerText.replace(/^\s*(\d+(\.\d+)*\.?)\s+/, '').trim();
      if (h.tagName === 'H1') {
        const m = txt.match(/^CHAPTER\s+(\w+)/i);
        if (m) { ch = WORDS.indexOf(m[1].toUpperCase()) + 1 || parseInt(m[1], 10) || ch + 1; sec = 0; }
        if (opts.caps) h.innerText = txt.toUpperCase();
        h.style.textAlign = 'center';
      } else if (h.tagName === 'H2') {
        sec++; sub = 0;
        h.innerText = opts.number && ch ? `${ch}.${sec} ${txt}` : txt;
      } else {
        sub++;
        h.innerText = opts.number && ch ? `${ch}.${sec}.${sub} ${txt}` : txt;
      }
    });
    if (opts.justify) el.querySelectorAll('p').forEach((p) => { if (p.style.textAlign !== 'center') p.style.textAlign = 'justify'; });
    if (opts.spacing) el.querySelectorAll('p,li').forEach((p) => { p.style.lineHeight = opts.spacing; });
    if (opts.clean) el.querySelectorAll('p').forEach((p) => { if (!p.innerText.trim() && !p.querySelector('img') && !p.classList.contains('page-break') && p.previousElementSibling?.tagName === 'P' && !p.previousElementSibling.innerText.trim()) p.remove(); });
    if (opts.font) { el.querySelectorAll('[style*="font-family"]').forEach((n) => { n.style.fontFamily = ''; }); el.querySelectorAll('font[face]').forEach((f) => f.removeAttribute('face')); }
    changed(); toast('Document auto-formatted');
  };

  const findReplace = (find, repl, all = true) => {
    if (!find) return 0;
    const walker = document.createTreeWalker(ed.current, NodeFilter.SHOW_TEXT);
    const rx = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), all ? 'gi' : 'i');
    let n = 0, node;
    while ((node = walker.nextNode())) {
      const m = node.nodeValue.match(new RegExp(rx.source, 'gi'));
      if (m) { n += m.length; if (repl !== null) node.nodeValue = node.nodeValue.replace(rx, repl); }
    }
    if (repl !== null && n) changed();
    return n;
  };

  const newDoc = async (kind) => {
    try {
      const d = await api.post('/documents', { title: kind ? SKELETONS[kind][1] ? `${SKELETONS[kind][0]} – ${SKELETONS[kind][1]}`.replace(/^ – /, '') : SKELETONS[kind][0] : 'Untitled document', content_html: kind ? skeletonHtml(kind) : '<p><br></p>' });
      await loadDocs(); nav(`/studio/${d.id}`); setModal(null);
    } catch (e) { toastErr(e); }
  };
  const importDocx = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const d = await api.post('/documents/import', fd); await loadDocs(); nav(`/studio/${d.id}`); toast('Word document imported'); } catch (e) { toastErr(e); }
  };
  const insertImage = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toastErr('Images must be under 3 MB');
    const rd = new FileReader();
    rd.onload = () => insertHTML(`<p style="text-align:center"><img src="${rd.result}" style="max-width:100%" alt="" /></p><p style="text-align:center"><i>Figure x.x: Caption</i></p>`);
    rd.readAsDataURL(file);
  };

  if (!feature('editor')) return <Empty>The Writing Studio is currently disabled by the administrator.</Empty>;

  return (
    <div className="studio">
      <aside className="studio-docs">
        <div className="row between"><strong>My documents</strong></div>
        <div className="stack-sm">
          <button className="btn sm block" onClick={() => setModal('new')}>+ New document</button>
          <button className="btn ghost sm block" onClick={() => fileIn.current.click()}>Import .docx</button>
          <input ref={fileIn} type="file" accept=".docx" hidden onChange={(e) => { importDocx(e.target.files[0]); e.target.value = ''; }} />
        </div>
        {!docs ? <Loading /> : !docs.length ? <p className="muted small">No documents yet.</p> : (
          <ul className="doc-list">
            {docs.map((d) => (
              <li key={d.id} className={String(d.id) === String(id) ? 'active' : ''}>
                <Link to={`/studio/${d.id}`}>{d.title}<small>{timeAgo(d.updated_at)}</small></Link>
                <button className="icon-btn sm" title="Archive" aria-label={`Archive ${d.title}`} onClick={() => setConfirmDel(d)}>🗄</button>
              </li>
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="archived-docs">
            <summary>Archived ({archived.length})</summary>
            <ul className="doc-list">{archived.map((d) => (
              <li key={d.id}><span className="archived-title">{d.title}</span><button className="btn ghost sm" onClick={() => restoreDoc(d)}>Restore</button></li>
            ))}</ul>
          </details>
        )}
      </aside>

      <section className="studio-main">
        {!doc ? (
          <div className="card studio-empty">
            <h2>Writing Studio</h2>
            <p className="muted">Draft your chapters with a full word processor, check similarity and AI-writing indicators, insert citations and export a PLASU-formatted Word document.</p>
            <div className="row wrap gap">{Object.keys(SKELETONS).map((k) => <button key={k} className="btn ghost" onClick={() => newDoc(k)}>Start {k.replace('chapter', 'Chapter ')}</button>)}</div>
          </div>
        ) : (<>
          <div className="studio-title">
            <input className="title-input" value={title} onChange={(e) => { setTitle(e.target.value); dirty.current = true; }} aria-label="Document title" />
            <span className="muted small">{status}</span>
            <button className="btn sm" onClick={save}>Save</button>
          </div>
          <Toolbar exec={exec} insertHTML={insertHTML} lineSpacing={lineSpacing} fontSize={fontSize} onImage={() => imgIn.current.click()} onTable={() => setModal('table')} onFind={() => setModal('find')} onLink={() => setModal('link')} />
          <input ref={imgIn} type="file" accept="image/*" hidden onChange={(e) => { insertImage(e.target.files[0]); e.target.value = ''; }} />
          <div className="page-wrap">
            <div ref={ed} className="page" contentEditable suppressContentEditableWarning spellCheck onInput={changed}
              onPaste={() => setTimeout(changed, 0)} aria-label="Document editor" />
          </div>
          <div className="statusbar"><span>{stats.words.toLocaleString()} words</span><span>{stats.chars.toLocaleString()} characters</span><span>{stats.paras} paragraphs</span><span>~{Math.max(1, Math.round(stats.words / 250))} page(s)</span><span>{Math.ceil(stats.words / 200)} min read</span></div>
        </>)}
      </section>

      {doc && (
        <aside className="studio-side">
          <Tabs value={panel} onChange={setPanel} tabs={[{ key: 'check', label: 'Check' }, { key: 'format', label: 'Format' }, { key: 'cite', label: 'Cite' }, { key: 'outline', label: 'Outline' }]} />
          {panel === 'check' && <CheckPanel getHtml={() => ed.current.innerHTML} />}
          {panel === 'format' && <FormatPanel title={title} getHtml={() => ed.current.innerHTML} autoFormat={autoFormat} insertSkeleton={(k) => insertHTML(skeletonHtml(k))} />}
          {panel === 'cite' && <CitePanel insertHTML={insertHTML} />}
          {panel === 'outline' && (
            <div className="outline">{!outline.length ? <p className="muted small">Add headings (H1/H2/H3) to build an outline.</p> : outline.map((h) => (
              <button key={h.i} className={`ol-item l${h.lvl}`} onClick={() => ed.current.querySelectorAll('h1,h2,h3')[h.i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{h.text}</button>
            ))}</div>
          )}
        </aside>
      )}

      {modal === 'new' && (
        <Modal title="New document" onClose={() => setModal(null)}>
          <div className="choice-grid">
            <button className="choice" onClick={() => newDoc(null)}><strong>Blank document</strong><small>Start from scratch</small></button>
            {Object.keys(SKELETONS).map((k) => <button key={k} className="choice" onClick={() => newDoc(k)}><strong>{k === 'article' ? 'Journal article' : k === 'proposal' ? 'Research proposal' : k.replace('chapter', 'Chapter ')}</strong><small>{SKELETONS[k][1] || SKELETONS[k][0]}</small></button>)}
          </div>
        </Modal>
      )}
      {modal === 'table' && <TableModal onClose={() => setModal(null)} onInsert={(r, c, cap) => {
        const head = `<tr>${Array.from({ length: c }, (_, i) => `<th>Header ${i + 1}</th>`).join('')}</tr>`;
        const rows = Array.from({ length: r - 1 }, () => `<tr>${Array.from({ length: c }, () => '<td>&nbsp;</td>').join('')}</tr>`).join('');
        insertHTML(`${cap ? `<p style="text-align:center"><b>Table x.x: ${cap}</b></p>` : ''}<table style="width:100%; border-collapse:collapse" border="1"><tbody>${head}${rows}</tbody></table><p><br></p>`);
        setModal(null);
      }} />}
      {modal === 'link' && <LinkModal onClose={() => setModal(null)} onInsert={(url) => { exec('createLink', url); setModal(null); }} />}
      {modal === 'find' && <FindModal onClose={() => setModal(null)} run={findReplace} />}
      {confirmDel && <Confirm yes="Archive" text={`Archive "${confirmDel.title}"? It moves to the Archived list and can be restored at any time. (Archived drafts still count in the institutional similarity check.)`} onClose={() => setConfirmDel(null)}
        onYes={async () => { try { await api.post(`/documents/${confirmDel.id}/archive`); await loadDocs(); loadArchived(); if (String(confirmDel.id) === String(id)) nav('/studio'); } catch (e) { toastErr(e); } }} />}
    </div>
  );
}

function Toolbar({ exec, insertHTML, lineSpacing, fontSize, onImage, onTable, onFind, onLink }) {
  const B = ({ cmd, val, label, title, onClick }) => (
    <button type="button" className="tb" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick || (() => exec(cmd, val))}>{label}</button>
  );
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-group"><B cmd="undo" label="↶" title="Undo (Ctrl+Z)" /><B cmd="redo" label="↷" title="Redo (Ctrl+Y)" /></div>
      <div className="tb-group">
        <select aria-label="Paragraph style" onChange={(e) => { exec('formatBlock', e.target.value); e.target.value = ''; }} defaultValue="">
          <option value="" disabled>Style</option><option value="P">Normal</option><option value="H1">Heading 1 (Chapter)</option><option value="H2">Heading 2 (Section)</option><option value="H3">Heading 3</option><option value="BLOCKQUOTE">Block quote</option>
        </select>
        <select aria-label="Font" onChange={(e) => { exec('fontName', e.target.value); e.target.value = ''; }} defaultValue=""><option value="" disabled>Font</option>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
        <select aria-label="Font size" onChange={(e) => { fontSize(e.target.value); e.target.value = ''; }} defaultValue=""><option value="" disabled>Size</option>{SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}</select>
      </div>
      <div className="tb-group">
        <B cmd="bold" label={<b>B</b>} title="Bold (Ctrl+B)" /><B cmd="italic" label={<i>I</i>} title="Italic (Ctrl+I)" /><B cmd="underline" label={<u>U</u>} title="Underline (Ctrl+U)" />
        <B cmd="strikeThrough" label={<s>S</s>} title="Strikethrough" /><B cmd="superscript" label="x²" title="Superscript" /><B cmd="subscript" label="x₂" title="Subscript" />
        <label className="tb color" title="Text colour"><span>A</span><input type="color" onChange={(e) => exec('foreColor', e.target.value)} aria-label="Text colour" /></label>
        <label className="tb color hl" title="Highlight"><span>▌</span><input type="color" defaultValue="#fff59d" onChange={(e) => exec('hiliteColor', e.target.value)} aria-label="Highlight colour" /></label>
      </div>
      <div className="tb-group">
        <B cmd="justifyLeft" label="⯇" title="Align left" /><B cmd="justifyCenter" label="≡" title="Centre" /><B cmd="justifyRight" label="⯈" title="Align right" /><B cmd="justifyFull" label="☰" title="Justify" />
        <select aria-label="Line spacing" onChange={(e) => { lineSpacing(e.target.value); e.target.value = ''; }} defaultValue=""><option value="" disabled>Spacing</option>{['1.0', '1.15', '1.5', '2.0', '2.5'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="tb-group">
        <B cmd="insertUnorderedList" label="•≡" title="Bulleted list" /><B cmd="insertOrderedList" label="1≡" title="Numbered list" />
        <B cmd="outdent" label="⇤" title="Decrease indent" /><B cmd="indent" label="⇥" title="Increase indent" />
      </div>
      <div className="tb-group">
        <B label="▦" title="Insert table" onClick={onTable} /><B label="🖼" title="Insert image / figure" onClick={onImage} /><B label="🔗" title="Insert link" onClick={onLink} />
        <B label="―" title="Horizontal line" onClick={() => insertHTML('<hr />')} />
        <B label="⤓" title="Page break" onClick={() => insertHTML('<div class="page-break" style="page-break-after: always;"></div><p><br></p>')} />
        <B label="Ω" title="Insert symbol" onClick={() => { const s = window.prompt('Symbol to insert (e.g. α β ± ≤ ≥ ° µ Σ χ²):', 'α'); if (s) insertHTML(s); }} />
      </div>
      <div className="tb-group"><B cmd="removeFormat" label="⌫" title="Clear formatting" /><B label="🔍" title="Find & replace" onClick={onFind} /><B label="🖨" title="Print / save as PDF" onClick={() => window.print()} /></div>
    </div>
  );
}

function TableModal({ onClose, onInsert }) {
  const [r, setR] = useState(3), [c, setC] = useState(3), [cap, setCap] = useState('');
  return (
    <Modal title="Insert table" onClose={onClose}>
      <div className="grid2"><Field label="Rows (incl. header)"><input type="number" min={2} max={50} value={r} onChange={(e) => setR(+e.target.value)} /></Field><Field label="Columns"><input type="number" min={1} max={12} value={c} onChange={(e) => setC(+e.target.value)} /></Field></div>
      <Field label="Caption (optional)"><input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Demographic characteristics of respondents" /></Field>
      <div className="row end"><button className="btn" onClick={() => onInsert(Math.max(2, r), Math.max(1, c), cap)}>Insert</button></div>
    </Modal>
  );
}
function LinkModal({ onClose, onInsert }) {
  const [url, setUrl] = useState('https://');
  return (
    <Modal title="Insert link" onClose={onClose}>
      <p className="muted small">Select text in the document first, then add the link.</p>
      <Field label="URL"><input value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      <div className="row end"><button className="btn" disabled={!/^https?:\/\/.+/.test(url)} onClick={() => onInsert(url)}>Insert</button></div>
    </Modal>
  );
}
function FindModal({ onClose, run }) {
  const [f, setF] = useState(''), [rp, setRp] = useState(''), [msg, setMsg] = useState('');
  return (
    <Modal title="Find & replace" onClose={onClose}>
      <Field label="Find"><input value={f} onChange={(e) => setF(e.target.value)} autoFocus /></Field>
      <Field label="Replace with"><input value={rp} onChange={(e) => setRp(e.target.value)} /></Field>
      {msg && <p className="muted">{msg}</p>}
      <div className="row end"><button className="btn ghost" onClick={() => setMsg(`${run(f, null)} match(es) found`)}>Count</button><button className="btn" onClick={() => setMsg(`${run(f, rp)} replacement(s) made`)}>Replace all</button></div>
    </Modal>
  );
}

export function CheckReport({ kind, data }) {
  if (data.score == null && kind === 'ai') return <p className="muted small">{data.note}</p>;
  const score = data.score ?? 0;
  const warn = kind === 'plag' ? 25 : 60;
  const tone = score >= warn ? 'high' : score >= warn / 2 ? 'mid' : 'low';
  return (
    <div className="report">
      <div className="report-head">
        <div className={`gauge ${tone}`}><strong>{Math.round(score)}%</strong><small>{kind === 'plag' ? 'similarity' : 'AI likelihood'}</small></div>
        <div>
          <strong>{kind === 'plag' ? (score >= warn ? 'High similarity — revise before submitting' : score > 10 ? 'Some overlap found' : 'Low similarity') : data.band}</strong>
          <p className="muted small">{data.totalWords ?? data.words} words analysed{data.readability ? ` · Flesch reading ease ${data.readability.flesch} (${data.readability.label})` : ''}</p>
        </div>
      </div>
      {kind === 'plag' && data.sources?.length > 0 && (
        <table className="table compact"><thead><tr><th>Matched source</th><th>Overlap</th></tr></thead>
          <tbody>{data.sources.map((s, i) => <tr key={i}><td>{s.title}<br /><small className="muted">{s.kind} · {s.owner}</small></td><td>{s.percent}%</td></tr>)}</tbody></table>
      )}
      {kind === 'ai' && (
        <ul className="signals">{data.signals.map((s) => <li key={s.name}><span>{s.name}</span><span className="sig-bar"><span style={{ width: `${s.weight}%` }} /></span><small className="muted">{String(s.value)}</small></li>)}</ul>
      )}
      {data.sentences?.some((s) => s.flagged) && (
        <details open><summary>Flagged passages ({data.sentences.filter((s) => s.flagged).length})</summary>
          <div className="flagged">{data.sentences.filter((s) => s.flagged).slice(0, 30).map((s, i) => (
            <p key={i}><mark>{s.text}</mark>{s.source && <small className="muted"> — matches {s.source}</small>}{s.phrases?.length ? <small className="muted"> — {s.phrases.join(', ')}</small> : null}</p>
          ))}</div>
        </details>
      )}
      <p className="muted small">{data.note}</p>
    </div>
  );
}

function CheckPanel({ getHtml }) {
  const { feature } = useAuth();
  const [plag, setPlag] = useState(null), [ai, setAi] = useState(null), [busy, setBusy] = useState('');
  const run = async (k) => {
    setBusy(k);
    try {
      if (k === 'plag') setPlag(await api.post('/tools/plagiarism', { html: getHtml() }));
      else setAi(await api.post('/tools/ai-check', { html: getHtml() }));
    } catch (e) { toastErr(e); }
    setBusy('');
  };
  return (
    <div className="stack">
      <p className="muted small">Assess your work before submission. Your supervisor sees the same scores on each submission.</p>
      {feature('plagiarism') && <><button className="btn block" disabled={!!busy} onClick={() => run('plag')}>{busy === 'plag' ? 'Checking…' : 'Run plagiarism check'}</button>{plag && <CheckReport kind="plag" data={plag} />}</>}
      {feature('ai_checker') && <><button className="btn block ghost" disabled={!!busy} onClick={() => run('ai')}>{busy === 'ai' ? 'Analysing…' : 'Run AI-writing check'}</button>{ai && <CheckReport kind="ai" data={ai} />}</>}
    </div>
  );
}

function FormatPanel({ title, getHtml, autoFormat, insertSkeleton }) {
  const [presets, setPresets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [o, setO] = useState({ preset: 'plasu_ug', prelims: false, toc: true });
  const [af, setAf] = useState({ number: true, caps: true, justify: true, clean: true, font: true, spacing: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/tools/presets').then(setPresets).catch(() => {});
    api.get('/tools/meta').then((m) => { setMeta(m); if (m.level === 'PG') setO((x) => ({ ...x, preset: 'plasu_pg' })); }).catch(() => {});
  }, []);
  const exportDocx = async () => {
    setBusy(true);
    try { await api.download('/tools/export', { html: getHtml(), title, preset: o.preset, includePrelims: o.prelims, includeToc: o.toc, meta }, `${title.replace(/[^\w\- ]+/g, '').trim() || 'document'}.docx`); toast('Formatted Word document downloaded'); } catch (e) { toastErr(e); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <h4>Automated formatting</h4>
      <div className="checks">
        <label><input type="checkbox" checked={af.number} onChange={(e) => setAf({ ...af, number: e.target.checked })} /> Auto-number section headings (1.1, 1.1.1)</label>
        <label><input type="checkbox" checked={af.caps} onChange={(e) => setAf({ ...af, caps: e.target.checked })} /> Chapter titles in CAPITALS, centred</label>
        <label><input type="checkbox" checked={af.justify} onChange={(e) => setAf({ ...af, justify: e.target.checked })} /> Justify body text</label>
        <label><input type="checkbox" checked={af.font} onChange={(e) => setAf({ ...af, font: e.target.checked })} /> Reset mixed fonts</label>
        <label><input type="checkbox" checked={af.clean} onChange={(e) => setAf({ ...af, clean: e.target.checked })} /> Remove repeated blank lines</label>
        <label>Line spacing <select value={af.spacing} onChange={(e) => setAf({ ...af, spacing: e.target.value })}><option value="">unchanged</option><option>1.5</option><option>2.0</option></select></label>
      </div>
      <button className="btn ghost block" onClick={() => autoFormat(af)}>Apply auto-format</button>
      <Field label="Insert structure"><select defaultValue="" onChange={(e) => { if (e.target.value) insertSkeleton(e.target.value); e.target.value = ''; }}>
        <option value="">Choose a section skeleton…</option>{Object.keys(SKELETONS).map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
      <hr />
      <h4>Export to Word (.docx)</h4>
      <Field label="Format preset"><select value={o.preset} onChange={(e) => setO({ ...o, preset: e.target.value })}>{presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
      <label className="check"><input type="checkbox" checked={o.toc} onChange={(e) => setO({ ...o, toc: e.target.checked })} /> Generate table of contents</label>
      <label className="check"><input type="checkbox" checked={o.prelims} onChange={(e) => setO({ ...o, prelims: e.target.checked })} /> Add preliminary pages (title, declaration, certification, dedication, acknowledgements, abstract)</label>
      {o.prelims && meta && (
        <div className="stack-sm">
          {['title', 'student', 'matric', 'department', 'faculty', 'degree', 'supervisor', 'hod'].map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input value={meta[k] || ''} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></Field>
          ))}
          <Field label="Dedication"><textarea rows={2} value={meta.dedication || ''} onChange={(e) => setMeta({ ...meta, dedication: e.target.value })} /></Field>
          <Field label="Acknowledgements"><textarea rows={3} value={meta.acknowledgements || ''} onChange={(e) => setMeta({ ...meta, acknowledgements: e.target.value })} /></Field>
          <Field label="Abstract"><textarea rows={4} value={meta.abstract || ''} onChange={(e) => setMeta({ ...meta, abstract: e.target.value })} /></Field>
        </div>
      )}
      <button className="btn block" disabled={busy} onClick={exportDocx}>{busy ? 'Generating…' : 'Download formatted .docx'}</button>
    </div>
  );
}

function CitePanel({ insertHTML }) {
  const [refs, setRefs] = useState(null);
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('cite_style') || 'apa'; } catch { return 'apa'; } });
  useEffect(() => { api.get('/references').then(setRefs).catch(() => setRefs([])); }, []);
  useEffect(() => { try { localStorage.setItem('cite_style', style); } catch { /* ignore */ } }, [style]);
  if (!refs) return <Loading />;
  return (
    <div className="stack">
      <Field label="Citation style"><select value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      {!refs.length ? <p className="muted small">Your library is empty. <Link to="/references">Add references</Link> first.</p> : (<>
        <button className="btn ghost block" onClick={() => insertHTML(`<h1>REFERENCES</h1>${bibliography(refs, style).map((b) => `<p style="padding-left:0.5in; text-indent:-0.5in;">${b}</p>`).join('')}`)}>Insert reference list</button>
        <ul className="cite-list">{refs.map((r, i) => (
          <li key={r.id}>
            <div className="small" dangerouslySetInnerHTML={{ __html: formatRef(r, style, i + 1) }} />
            <button className="btn sm ghost" onClick={() => insertHTML(` ${inText(r, style, i + 1)}`)}>Cite {inText(r, style, i + 1)}</button>
          </li>
        ))}</ul>
      </>)}
      <Link to="/references" className="small">Manage reference library →</Link>
    </div>
  );
}
