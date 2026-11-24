import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, timeAgo, toast, toastErr } from './ui.jsx';

/** Highlighter colours double as comment categories so a supervisor's intent is visible at a glance. */
export const HIGHLIGHTERS = [
  { key: 'pink', color: '#f8bbd0', edge: '#c2185b', label: 'Error — must correct' },
  { key: 'yellow', color: '#fff59d', edge: '#b59f00', label: 'General comment' },
  { key: 'blue', color: '#bbdefb', edge: '#1565c0', label: 'Clarify / expand' },
  { key: 'orange', color: '#ffe0b2', edge: '#e65100', label: 'Citation needed' },
  { key: 'purple', color: '#e1bee7', edge: '#6a1b9a', label: 'Grammar & style' },
  { key: 'green', color: '#c8e6c9', edge: '#2e7d32', label: 'Good work' },
];
const HL = Object.fromEntries(HIGHLIGHTERS.map((h) => [h.key, h]));

const newCid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Wraps every text node inside `range` in <mark class="cmt"> without breaking block structure (works across paragraphs). */
function wrapRange(range, cid, hl) {
  const { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
  let root = range.commonAncestorContainer;
  if (root.nodeType !== 1) root = root.parentNode;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (range.intersectsNode(walker.currentNode) && walker.currentNode.nodeValue.length) nodes.push(walker.currentNode);
  let wrapped = 0;
  for (const n of nodes) {
    const start = n === sc ? so : 0;
    const end = n === ec ? eo : n.nodeValue.length;
    if (start >= end || !n.nodeValue.slice(start, end).trim()) continue;
    let seg = n;
    if (end < seg.nodeValue.length) seg.splitText(end);
    if (start > 0) seg = seg.splitText(start);
    const m = document.createElement('mark');
    m.className = 'cmt'; m.dataset.cid = cid; m.dataset.color = hl.key;
    m.style.backgroundColor = hl.color;
    seg.parentNode.insertBefore(m, seg); m.appendChild(seg);
    wrapped++;
  }
  return wrapped;
}
const unwrap = (root, cid) => root.querySelectorAll(`mark.cmt[data-cid="${cid}"]`).forEach((m) => m.replaceWith(...m.childNodes));
export const stripMarks = (html) => {
  const d = document.createElement('div'); d.innerHTML = html || '';
  d.querySelectorAll('mark.cmt').forEach((m) => m.replaceWith(...m.childNodes));
  return d.innerHTML;
};
// Splits HTML into paragraph-level text blocks. A detached element has no layout, so innerText would not
// insert line breaks between headings/paragraphs — walk the leaf block elements instead.
const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,pre';
const blocksOf = (html) => {
  const d = document.createElement('div'); d.innerHTML = stripMarks(html);
  const leaves = [...d.querySelectorAll(BLOCK)].filter((el) => !el.querySelector(BLOCK));
  const texts = leaves.length ? leaves.map((el) => el.textContent) : [d.textContent || ''];
  return texts.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
};

/** Longest-common-subsequence diff (used per paragraph, then per word inside changed paragraphs). */
function lcs(a, b) {
  const m = a.length, n = b.length;
  if (m * n > 4e6) return [...a.map((x) => ({ t: 'del', v: x })), ...b.map((x) => ({ t: 'ins', v: x }))];
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: 'eq', v: a[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', v: a[i++] }); else out.push({ t: 'ins', v: b[j++] });
  }
  while (i < m) out.push({ t: 'del', v: a[i++] });
  while (j < n) out.push({ t: 'ins', v: b[j++] });
  return out;
}
export function TrackChanges({ original, revised }) {
  const paras = useMemo(() => {
    const ops = lcs(blocksOf(original), blocksOf(revised));
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      // Pair a deleted paragraph with the inserted one that follows it → show a word-level diff.
      if (ops[k].t === 'del' && ops[k + 1]?.t === 'ins') { out.push({ t: 'chg', words: lcs(ops[k].v.split(' '), ops[k + 1].v.split(' ')) }); k++; } else out.push(ops[k]);
    }
    return out;
  }, [original, revised]);
  const changed = paras.filter((p) => p.t !== 'eq').length;
  if (!changed) return <Empty>The supervisor has not changed any wording (only highlights/comments, if any).</Empty>;
  return (
    <div className="track-changes">
      <p className="muted small">{changed} paragraph{changed === 1 ? '' : 's'} changed · <ins>inserted text</ins> · <del>deleted text</del></p>
      {paras.map((p, i) => (p.t === 'eq' ? <p key={i} className="tc-eq">{p.v}</p>
        : p.t === 'ins' ? <p key={i}><ins>{p.v}</ins></p>
          : p.t === 'del' ? <p key={i}><del>{p.v}</del></p>
            : <p key={i}>{p.words.map((w, j) => (w.t === 'eq' ? `${w.v} ` : w.t === 'ins' ? <ins key={j}>{w.v} </ins> : <del key={j}>{w.v} </del>))}</p>))}
    </div>
  );
}

/**
 * Inline review surface for a submission.
 * Supervisor: select text → pick a highlighter → write a comment; toggle "Edit text" for direct corrections; save.
 * Student: read highlights, reply, resolve, and pull the reviewed text into the Writing Studio.
 */
export default function Annotator({ submission, onChange }) {
  const s = submission;
  const nav = useNavigate();
  const canReview = s.can_review;
  const doc = useRef(null);
  const range = useRef(null);
  const [view, setView] = useState('annotated');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(null); // { hl, quote }
  const [draftBody, setDraftBody] = useState('');
  const [active, setActive] = useState(null);
  const [show, setShow] = useState('open');
  const [colorFilter, setColorFilter] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const comments = s.comments || [];
  const threads = comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const working = s.reviewed_html ?? s.content_html ?? '';

  // Render the working copy only when the stored version changes (not on every keystroke while editing).
  useEffect(() => {
    if (view === 'annotated' && doc.current) { doc.current.innerHTML = working; decorate(); setDirty(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, view]);
  useEffect(() => { decorate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [comments, active]);

  function decorate() {
    if (!doc.current) return;
    const byCid = Object.fromEntries(threads.map((c) => [c.cid, c]));
    doc.current.querySelectorAll('mark.cmt').forEach((m) => {
      const c = byCid[m.dataset.cid];
      m.classList.toggle('resolved', c?.status === 'resolved');
      m.classList.toggle('active', !!active && m.dataset.cid === active);
      m.title = c ? `${HL[c.color]?.label || ''}${c.body ? ': ' + c.body : ''}` : '';
    });
  }

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (sel.rangeCount && doc.current?.contains(sel.anchorNode) && !sel.isCollapsed) range.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const pickHighlighter = (hl) => {
    const r = range.current;
    if (!r || r.collapsed || !doc.current.contains(r.commonAncestorContainer)) return toast('Select some text in the document first, then choose a highlighter.', 'error');
    setDraft({ hl, quote: r.toString().trim().slice(0, 300) });
    setDraftBody('');
  };

  const addComment = async () => {
    const r = range.current;
    const cid = newCid();
    if (!wrapRange(r, cid, draft.hl)) return toastErr('Could not highlight that selection — try selecting plain text.');
    window.getSelection().removeAllRanges(); range.current = null;
    try {
      const out = await api.post(`/projects/submissions/${s.id}/comments`, { cid, color: draft.hl.key, category: draft.hl.label, quote: draft.quote, body: draftBody, html: doc.current.innerHTML });
      onChange({ ...s, comments: out.comments, reviewed_html: out.reviewed_html });
      setDraft(null); setActive(cid); setShow('open');
    } catch (e) { unwrap(doc.current, cid); toastErr(e); }
  };

  const saveEdits = async () => {
    try {
      const out = await api.put(`/projects/submissions/${s.id}/annotate`, { html: doc.current.innerHTML });
      onChange({ ...s, reviewed_html: doc.current.innerHTML, annotated_at: out.annotated_at }); setDirty(false); toast('Reviewed copy saved');
    } catch (e) { toastErr(e); }
  };

  const setStatus = async (c, status) => {
    let html;
    if (status === 'withdrawn') { unwrap(doc.current, c.cid); html = doc.current.innerHTML; }
    try {
      const out = await api.put(`/projects/submissions/${s.id}/comments/${c.id}`, { status, ...(html !== undefined && { html }) });
      onChange({ ...s, comments: out.comments, reviewed_html: out.reviewed_html });
    } catch (e) { toastErr(e); }
  };
  const sendReply = async (c) => {
    try {
      const out = await api.post(`/projects/submissions/${s.id}/comments`, { parent_id: c.id, body: reply });
      onChange({ ...s, comments: out.comments }); setReply(''); setReplyTo(null);
    } catch (e) { toastErr(e); }
  };
  const focus = (cid) => {
    setActive(cid);
    doc.current?.querySelector(`mark.cmt[data-cid="${cid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const toStudio = async (clean) => {
    try {
      const d = await api.post('/documents', { title: `${s.stage_label} v${s.version} — ${clean ? 'reviewed (clean)' : 'with supervisor comments'}`, content_html: clean ? stripMarks(working) : working });
      toast('Copied to your Writing Studio'); nav(`/studio/${d.id}`);
    } catch (e) { toastErr(e); }
  };

  // Comments listed in document order
  const order = useMemo(() => {
    const d = document.createElement('div'); d.innerHTML = working;
    return [...new Set([...d.querySelectorAll('mark.cmt')].map((m) => m.dataset.cid))];
  }, [working]);
  const visible = threads
    .filter((c) => c.status !== 'withdrawn' && (show === 'all' || c.status === show) && (!colorFilter || c.color === colorFilter))
    .sort((a, b) => order.indexOf(a.cid) - order.indexOf(b.cid));
  const counts = { open: threads.filter((c) => c.status === 'open').length, resolved: threads.filter((c) => c.status === 'resolved').length };

  return (
    <div className="annotator">
      <div className="ann-bar">
        <div className="seg sm" role="tablist" aria-label="View">
          {[['annotated', canReview ? 'Review' : 'Annotated'], ['original', 'Original'], ['changes', 'Track changes']].map(([k, l]) => (
            <button key={k} type="button" className={view === k ? 'active' : ''} onClick={() => { if (dirty && !window.confirm('Discard unsaved text edits?')) return; setEditing(false); setView(k); }}>{l}</button>
          ))}
        </div>
        {canReview && view === 'annotated' && (<>
          <div className="highlighters" role="toolbar" aria-label="Highlighters">
            {HIGHLIGHTERS.map((h) => (
              <button key={h.key} type="button" className="hl-btn" style={{ background: h.color, borderColor: h.edge }} title={`${h.label} — select text, then click`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pickHighlighter(h)}><span>{h.label.split(' ')[0].replace(/[—/]/g, '')}</span></button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} /> Edit text</label>
          {editing && <>
            <button type="button" className="tb" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand('bold'); setDirty(true); }}><b>B</b></button>
            <button type="button" className="tb" title="Strike through (suggest deletion)" onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand('strikeThrough'); setDirty(true); }}><s>S</s></button>
            <button type="button" className="tb" title="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('undo')}>↶</button>
          </>}
          <button type="button" className="btn sm" disabled={!dirty} onClick={saveEdits}>{dirty ? 'Save edits' : 'Saved'}</button>
        </>)}
        {!canReview && s.reviewed_html && (
          <div className="row gap ann-student-actions">
            <button type="button" className="btn ghost sm" onClick={() => toStudio(true)} title="Supervisor's edits applied, highlights removed">Open clean copy in Studio</button>
            <button type="button" className="btn ghost sm" onClick={() => toStudio(false)}>Open with highlights</button>
          </div>
        )}
      </div>

      {canReview && view === 'annotated' && <p className="muted small ann-hint">Select text, then click a highlighter to comment on it. {editing ? 'Edit mode is on — type directly in the document and click Save edits. The student’s original is kept; changes appear under Track changes.' : 'Turn on “Edit text” to correct wording directly.'}</p>}

      <div className="ann-body">
        <div className="ann-doc-wrap">
          {view === 'annotated' && (
            <div ref={doc} className={`doc-preview ann-doc ${editing ? 'editing' : ''}`} contentEditable={canReview && editing} suppressContentEditableWarning
              onInput={() => setDirty(true)}
              onClick={(e) => { const m = e.target.closest?.('mark.cmt'); if (m) setActive(m.dataset.cid); }}
              aria-label="Submission text" />
          )}
          {view === 'original' && <div className="doc-preview ann-doc" dangerouslySetInnerHTML={{ __html: s.content_html || '' }} />}
          {view === 'changes' && <div className="doc-preview ann-doc"><TrackChanges original={s.content_html} revised={working} /></div>}
        </div>

        <aside className="ann-side">
          {draft && (
            <div className="ann-card draft" style={{ borderLeftColor: draft.hl.edge }}>
              <div className="ann-cat"><span className="swatch" style={{ background: draft.hl.color, borderColor: draft.hl.edge }} />{draft.hl.label}</div>
              <blockquote>“{draft.quote}”</blockquote>
              <textarea rows={3} autoFocus value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder="Comment (optional for “Good work”)…"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(); }} />
              <div className="row end"><button className="btn ghost sm" onClick={() => setDraft(null)}>Cancel</button><button className="btn sm" onClick={addComment} disabled={!draftBody.trim() && draft.hl.key !== 'green'}>Add comment</button></div>
            </div>
          )}
          <div className="ann-filters">
            {[['open', `Open (${counts.open})`], ['resolved', `Resolved (${counts.resolved})`], ['all', 'All']].map(([k, l]) => (
              <button key={k} type="button" className={`chip ${show === k ? '' : 'off'}`} onClick={() => setShow(k)}>{l}</button>
            ))}
            <div className="swatches">
              {HIGHLIGHTERS.map((h) => (
                <button key={h.key} type="button" className={`swatch ${colorFilter === h.key ? 'on' : ''}`} style={{ background: h.color, borderColor: h.edge }} title={`Show only: ${h.label}`} aria-label={`Filter ${h.label}`}
                  onClick={() => setColorFilter(colorFilter === h.key ? '' : h.key)} />
              ))}
            </div>
          </div>
          {!visible.length ? <p className="muted small">{threads.length ? 'No comments in this view.' : canReview ? 'No comments yet.' : 'Your supervisor has not added inline comments.'}</p> : visible.map((c) => {
            const h = HL[c.color] || HIGHLIGHTERS[1];
            return (
              <div key={c.id} className={`ann-card ${active === c.cid ? 'active' : ''} ${c.status}`} style={{ borderLeftColor: h.edge }} onClick={() => focus(c.cid)}>
                <div className="ann-cat"><span className="swatch" style={{ background: h.color, borderColor: h.edge }} />{c.category || h.label}{c.status === 'resolved' && <span className="badge good">resolved</span>}</div>
                {c.quote && <blockquote>“{c.quote.length > 140 ? c.quote.slice(0, 140) + '…' : c.quote}”</blockquote>}
                {c.body && <p className="prewrap">{c.body}</p>}
                <small className="muted">{c.author_title} {c.author} · {timeAgo(c.created_at)}</small>
                {replies(c.id).map((r) => <div key={r.id} className="ann-reply"><strong>{r.author}</strong> <small className="muted">{timeAgo(r.created_at)}</small><p className="prewrap">{r.body}</p></div>)}
                {s.can_reply && (
                  <div className="row gap wrap ann-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn ghost sm" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReply(''); }}>Reply</button>
                    {c.status === 'open' ? <button className="btn ghost sm" onClick={() => setStatus(c, 'resolved')}>✓ Resolve</button> : <button className="btn ghost sm" onClick={() => setStatus(c, 'open')}>Reopen</button>}
                    {canReview && <button className="btn ghost sm danger" title="Remove the highlight; the comment is kept on record as withdrawn" onClick={() => setStatus(c, 'withdrawn')}>Withdraw</button>}
                  </div>
                )}
                {replyTo === c.id && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" autoFocus />
                    <div className="row end"><button className="btn sm" disabled={!reply.trim()} onClick={() => sendReply(c)}>Send</button></div>
                  </div>
                )}
              </div>
            );
          })}
          <details className="legend"><summary>Highlighter key</summary>
            {HIGHLIGHTERS.map((h) => <div key={h.key} className="ann-cat"><span className="swatch" style={{ background: h.color, borderColor: h.edge }} />{h.label}</div>)}
          </details>
        </aside>
      </div>
    </div>
  );
}
