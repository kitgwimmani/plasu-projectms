import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import mammoth from 'mammoth';
import { q, UPLOAD_DIR, archiveRow, restoreRow } from '../db.js';
import { authenticate, isAdmin } from '../lib/auth.js';
import { log, notify, notifyMany, requireFeature, sanitizeHtml, asyncH, stripHtml } from '../lib/util.js';
import { plagiarismCheck, aiCheck } from '../lib/checkers.js';
import { buildDocx, FORMAT_PRESETS } from '../lib/docx.js';
import { upload } from './projects.js';

const r = Router();
r.use(authenticate);
const safeName = (s) => String(s || 'document').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'document';

// ---------- Writing studio documents ----------
const docs = Router();
docs.use(requireFeature('editor'));
docs.get('/', (req, res) => res.json(q.all(`SELECT id, title, kind, updated_at, archived_at, length(content_html) AS size FROM documents
  WHERE user_id = ? AND (archived_at IS NULL) = (? = 0) ORDER BY updated_at DESC`, req.user.id, req.query.archived ? 1 : 0)));
docs.post('/', (req, res) => {
  const id = q.run('INSERT INTO documents(user_id, title, content_html, kind) VALUES (?,?,?,?)', req.user.id, req.body?.title?.trim() || 'Untitled document', sanitizeHtml(req.body?.content_html || ''), req.body?.kind || 'chapter').id;
  log(req.user.id, 'Created document', 'document', id, req.body?.title);
  res.status(201).json(q.get('SELECT * FROM documents WHERE id = ?', id));
});
docs.post('/import', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file || !/\.docx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Upload a .docx file' });
  const { value } = await mammoth.convertToHtml({ path: req.file.path });
  fs.rmSync(req.file.path, { force: true });
  const id = q.run('INSERT INTO documents(user_id, title, content_html) VALUES (?,?,?)', req.user.id, req.file.originalname.replace(/\.docx$/i, ''), sanitizeHtml(value)).id;
  log(req.user.id, 'Imported Word document', 'document', id, req.file.originalname);
  res.status(201).json(q.get('SELECT * FROM documents WHERE id = ?', id));
}));
const ownDoc = (req, res) => {
  const d = q.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!d) res.status(404).json({ error: 'Document not found' });
  return d;
};
docs.get('/:id', (req, res) => { const d = ownDoc(req, res); if (d) res.json(d); });
docs.put('/:id', (req, res) => {
  const d = ownDoc(req, res); if (!d) return;
  q.run("UPDATE documents SET title = COALESCE(?, title), content_html = COALESCE(?, content_html), updated_at = datetime('now') WHERE id = ?",
    req.body?.title?.trim() || null, req.body?.content_html !== undefined ? sanitizeHtml(req.body.content_html) : null, d.id);
  res.json(q.get('SELECT id, title, updated_at FROM documents WHERE id = ?', d.id));
});
// Archived drafts stay in the similarity corpus, so archiving cannot be used to dodge the plagiarism check.
docs.post('/:id/archive', (req, res) => { const d = ownDoc(req, res); if (!d) return; archiveRow('documents', d.id, req.user.id); log(req.user.id, 'Archived document', 'document', d.id, d.title); res.json({ ok: true }); });
docs.post('/:id/restore', (req, res) => { const d = ownDoc(req, res); if (!d) return; restoreRow('documents', d.id); log(req.user.id, 'Restored document', 'document', d.id, d.title); res.json({ ok: true }); });
r.use('/documents', docs);

// ---------- Integrity checks ----------
r.post('/tools/plagiarism', requireFeature('plagiarism'), (req, res) => {
  const out = plagiarismCheck(req.body?.html || '', req.user.id);
  log(req.user.id, 'Ran plagiarism check', 'tool', null, `${out.score}% similarity`);
  res.json(out);
});
r.post('/tools/ai-check', requireFeature('ai_checker'), (req, res) => {
  const out = aiCheck(req.body?.html || '');
  log(req.user.id, 'Ran AI-writing check', 'tool', null, out.score != null ? `${out.score}%` : 'insufficient text');
  res.json(out);
});

// ---------- Automated formatting & export ----------
r.get('/tools/presets', (req, res) => res.json(Object.entries(FORMAT_PRESETS).map(([key, v]) => ({ key, ...v }))));

r.get('/tools/meta', (req, res) => res.json(autoMeta(req.user.id)));
function autoMeta(uid) {
  const u = q.get(`SELECT u.*, d.name AS dept, f.name AS fac, pg.degree, pg.name AS prog, d.hod_id FROM users u
    LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN faculties f ON f.id = u.faculty_id LEFT JOIN programs pg ON pg.id = u.program_id WHERE u.id = ?`, uid);
  const p = q.get('SELECT p.*, s.name AS sup, s.title AS sup_title FROM projects p LEFT JOIN users s ON s.id = p.supervisor_id WHERE p.student_id = ?', uid);
  const hod = u?.hod_id ? q.get('SELECT name, title FROM users WHERE id = ?', u.hod_id) : null;
  return {
    title: p?.title || '', student: u?.name, matric: u?.matric_no || '', department: u?.dept ? `Department of ${u.dept}` : '',
    faculty: u?.fac || '', degree: u?.prog || u?.degree || '', supervisor: p?.sup ? `${p.sup_title || ''} ${p.sup}`.trim() : '',
    hod: hod ? `${hod.title || ''} ${hod.name}`.trim() : '', abstract: p?.abstract || '', level: p?.level || u?.level || 'UG',
  };
}

r.post('/tools/export', asyncH(async (req, res) => {
  const b = req.body || {};
  const meta = { ...autoMeta(req.user.id), ...(b.meta || {}) };
  const buf = await buildDocx({
    html: sanitizeHtml(b.html || ''), presetKey: b.preset, meta, level: meta.level, includePrelims: !!b.includePrelims,
    includeToc: b.includeToc !== false, title: b.title || 'Document',
  });
  log(req.user.id, 'Exported formatted document', 'tool', null, `${b.title} (${b.preset})`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(b.title)}.docx"`);
  res.send(Buffer.from(buf));
}));

// ---------- Reference library ----------
const refs = Router();
refs.use(requireFeature('references'));
const REF_FIELDS = ['type', 'authors', 'year', 'title', 'source', 'volume', 'issue', 'pages', 'publisher', 'place', 'url', 'doi', 'accessed'];
refs.get('/', (req, res) => res.json(q.all('SELECT * FROM ref_items WHERE user_id = ? AND (archived_at IS NULL) = (? = 0) ORDER BY authors, year', req.user.id, req.query.archived ? 1 : 0)));
refs.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const id = q.run(`INSERT INTO ref_items(user_id, ${REF_FIELDS.join(',')}) VALUES (?, ${REF_FIELDS.map(() => '?').join(',')})`, req.user.id, ...REF_FIELDS.map((f) => b[f])).id;
  res.status(201).json(q.get('SELECT * FROM ref_items WHERE id = ?', id));
});
refs.put('/:id', (req, res) => {
  const row = q.get('SELECT * FROM ref_items WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  q.run(`UPDATE ref_items SET ${REF_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...REF_FIELDS.map((f) => req.body?.[f] ?? row[f]), row.id);
  res.json(q.get('SELECT * FROM ref_items WHERE id = ?', row.id));
});
const ownRef = (req, res) => {
  const row = q.get('SELECT * FROM ref_items WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) res.status(404).json({ error: 'Not found' });
  return row;
};
refs.post('/:id/archive', (req, res) => { const row = ownRef(req, res); if (!row) return; archiveRow('ref_items', row.id, req.user.id); res.json({ ok: true }); });
refs.post('/:id/restore', (req, res) => { const row = ownRef(req, res); if (!row) return; restoreRow('ref_items', row.id); res.json({ ok: true }); });
// Metadata lookup via the public Crossref API
refs.get('/lookup/doi', asyncH(async (req, res) => {
  const doi = String(req.query.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return res.status(400).json({ error: 'Enter a valid DOI, e.g. 10.1000/xyz123' });
  try {
    const rsp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { 'User-Agent': 'PLASU-PMS/1.0 (reference lookup)' }, signal: AbortSignal.timeout(10000) });
    if (!rsp.ok) return res.status(404).json({ error: 'DOI not found on Crossref' });
    const m = (await rsp.json()).message;
    const year = (m.issued?.['date-parts']?.[0]?.[0] || m.created?.['date-parts']?.[0]?.[0] || '').toString();
    res.json({
      type: m.type === 'book' || m.type === 'monograph' ? 'book' : m.type === 'book-chapter' ? 'chapter' : 'journal',
      authors: (m.author || []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).join('; '),
      year, title: m.title?.[0] || '', source: m['container-title']?.[0] || '', volume: m.volume || '', issue: m.issue || '',
      pages: m.page || '', publisher: m.publisher || '', doi, url: m.URL || '',
    });
  } catch { res.status(502).json({ error: 'Could not reach Crossref. Check your internet connection or enter details manually.' }); }
}));
r.use('/references', refs);

// ---------- Resources: templates, guidelines, referencing materials ----------
const resR = Router();
resR.use(requireFeature('resources'));
resR.get('/', (req, res) => {
  const { kind } = req.query;
  const archived = req.query.archived && PUBLISHERS.includes(req.user.role) ? 1 : 0;
  res.json(q.all(`SELECT r.*, u.name AS uploaded_by_name, f.name AS faculty_name FROM resources r LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN faculties f ON f.id = r.faculty_id WHERE (? IS NULL OR r.kind = ?) AND (r.archived_at IS NULL) = (? = 0)
    ORDER BY r.kind, r.id DESC`, kind || null, kind || null, archived));
});
const PUBLISHERS = ['superadmin', 'sysadmin', 'dean', 'hod'];
resR.post('/', upload.single('file'), (req, res) => {
  if (!['superadmin', 'sysadmin', 'dean', 'hod'].includes(req.user.role)) return res.status(403).json({ error: 'Only deans, HODs and administrators can publish resources' });
  const b = req.body || {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!req.file && !b.url?.trim()) return res.status(400).json({ error: 'Attach a file (.docx, .pdf…) or provide a link' });
  if (b.url && !/^https?:\/\//i.test(b.url)) return res.status(400).json({ error: 'Links must start with http:// or https://' });
  const id = q.run('INSERT INTO resources(kind, title, description, file_path, file_name, url, faculty_id, level, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)',
    ['template', 'guideline', 'referencing', 'other'].includes(b.kind) ? b.kind : 'other', b.title.trim(), b.description, req.file?.filename, req.file?.originalname,
    b.url?.trim() || null, req.user.role === 'dean' ? req.user.faculty_id : b.faculty_id || null, b.level || 'ALL', req.user.id).id;
  log(req.user.id, 'Published resource', 'resource', id, b.title);
  res.status(201).json({ id });
});
// Resources are archived (hidden from students, file kept on disk) so they can be restored later.
const resourceState = (restore) => (req, res) => {
  const row = q.get('SELECT * FROM resources WHERE id = ?', req.params.id);
  if (!row || !(isAdmin(req.user) || row.uploaded_by === req.user.id)) return res.status(403).json({ error: 'Not allowed' });
  const changed = restore ? restoreRow('resources', row.id) : archiveRow('resources', row.id, req.user.id);
  if (!changed) return res.status(400).json({ error: restore ? 'Resource is not archived' : 'Already archived' });
  log(req.user.id, restore ? 'Restored resource' : 'Archived resource', 'resource', row.id, row.title);
  res.json({ ok: true });
};
resR.post('/:id/archive', resourceState(false));
resR.post('/:id/restore', resourceState(true));
resR.get('/:id/download', (req, res) => {
  const row = q.get('SELECT * FROM resources WHERE id = ?', req.params.id);
  if (!row?.file_path || (row.archived_at && !PUBLISHERS.includes(req.user.role))) return res.status(404).json({ error: 'File not found' });
  q.run('UPDATE resources SET downloads = downloads + 1 WHERE id = ?', row.id);
  res.download(path.join(UPLOAD_DIR, path.basename(row.file_path)), row.file_name);
});
r.use('/resources', resR);

// ---------- Manuscripts (publication support) ----------
const ms = Router();
ms.use(requireFeature('manuscripts'));
export const MS_STATUSES = ['drafting', 'internal_review', 'ready', 'submitted', 'under_review', 'revision', 'accepted', 'published', 'rejected'];
const member = (mid, uid) => q.get('SELECT * FROM manuscript_members WHERE manuscript_id = ? AND user_id = ?', mid, uid);
const loadMs = (req, res) => {
  const m = q.get('SELECT m.*, u.name AS owner_name FROM manuscripts m JOIN users u ON u.id = m.owner_id WHERE m.id = ?', req.params.id);
  if (!m || !(m.owner_id === req.user.id || member(m.id, req.user.id) || isAdmin(req.user))) { res.status(404).json({ error: 'Manuscript not found' }); return null; }
  return m;
};
ms.get('/', (req, res) => res.json(q.all(`SELECT m.id, m.title, m.status, m.target_journal, m.updated_at, m.owner_id, m.archived_at, u.name AS owner_name,
  (SELECT GROUP_CONCAT(x.name, ', ') FROM manuscript_members mm JOIN users x ON x.id = mm.user_id WHERE mm.manuscript_id = m.id) AS authors
  FROM manuscripts m JOIN users u ON u.id = m.owner_id
  WHERE (m.owner_id = ? OR EXISTS (SELECT 1 FROM manuscript_members mm WHERE mm.manuscript_id = m.id AND mm.user_id = ?))
    AND (m.archived_at IS NULL) = (? = 0)
  ORDER BY m.updated_at DESC`, req.user.id, req.user.id, req.query.archived ? 1 : 0)));
ms.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const id = q.run('INSERT INTO manuscripts(owner_id, title, abstract, keywords, target_journal) VALUES (?,?,?,?,?)', req.user.id, b.title.trim(), b.abstract, b.keywords, b.target_journal).id;
  q.run('INSERT INTO manuscript_members(manuscript_id, user_id, role) VALUES (?,?,?)', id, req.user.id, 'lead author');
  log(req.user.id, 'Created manuscript', 'manuscript', id, b.title);
  res.status(201).json({ id });
});
ms.get('/:id', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  res.json({
    ...m, statuses: MS_STATUSES,
    members: q.all('SELECT mm.role, u.id, u.name, u.title, u.email, u.role AS user_role FROM manuscript_members mm JOIN users u ON u.id = mm.user_id WHERE mm.manuscript_id = ?', m.id),
    comments: q.all('SELECT c.*, u.name AS author FROM manuscript_comments c JOIN users u ON u.id = c.user_id WHERE c.manuscript_id = ? ORDER BY c.id', m.id),
  });
});
ms.put('/:id', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  const b = req.body || {};
  if (m.archived_at) return res.status(409).json({ error: 'This manuscript is archived. Restore it before editing.' });
  if (b.status && !MS_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
  q.run(`UPDATE manuscripts SET title = COALESCE(?, title), abstract = COALESCE(?, abstract), keywords = COALESCE(?, keywords),
    target_journal = COALESCE(?, target_journal), status = COALESCE(?, status), doi = COALESCE(?, doi),
    content_html = COALESCE(?, content_html), updated_at = datetime('now') WHERE id = ?`,
  b.title, b.abstract, b.keywords, b.target_journal, b.status, b.doi, b.content_html !== undefined ? sanitizeHtml(b.content_html) : null, m.id);
  if (b.status && b.status !== m.status) {
    const others = q.all('SELECT user_id FROM manuscript_members WHERE manuscript_id = ? AND user_id != ?', m.id, req.user.id).map((x) => x.user_id);
    notifyMany(others, 'Manuscript status changed', `"${m.title}" is now ${b.status.replace('_', ' ')}`, `/manuscripts/${m.id}`);
    log(req.user.id, 'Updated manuscript status', 'manuscript', m.id, `${m.title} → ${b.status}`);
  }
  res.json({ ok: true });
});
// Manuscripts are archived (co-authors, comments and files retained) rather than deleted.
const msState = (restore) => (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (m.owner_id !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: 'Only the lead author can archive or restore' });
  const changed = restore ? restoreRow('manuscripts', m.id) : archiveRow('manuscripts', m.id, req.user.id);
  if (!changed) return res.status(400).json({ error: restore ? 'Manuscript is not archived' : 'Already archived' });
  const others = q.all('SELECT user_id FROM manuscript_members WHERE manuscript_id = ? AND user_id != ?', m.id, req.user.id).map((x) => x.user_id);
  notifyMany(others, restore ? 'Manuscript restored' : 'Manuscript archived', `"${m.title}" was ${restore ? 'restored' : 'archived'} by ${req.user.name}`, `/manuscripts/${m.id}`);
  log(req.user.id, restore ? 'Restored manuscript' : 'Archived manuscript', 'manuscript', m.id, m.title);
  res.json({ ok: true });
};
ms.post('/:id/archive', msState(false));
ms.post('/:id/restore', msState(true));
ms.post('/:id/members', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (m.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the lead author can add co-authors' });
  const u = q.get("SELECT id, name FROM users WHERE (id = ? OR email = ?) AND status = 'active'", req.body?.user_id, req.body?.email);
  if (!u) return res.status(404).json({ error: 'User not found on the platform' });
  q.run('INSERT OR REPLACE INTO manuscript_members(manuscript_id, user_id, role) VALUES (?,?,?)', m.id, u.id, req.body?.role || 'co-author');
  notify(u.id, 'Added as co-author', `${req.user.name} added you to "${m.title}"`, `/manuscripts/${m.id}`);
  res.status(201).json({ ok: true });
});
ms.delete('/:id/members/:uid', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (m.owner_id !== req.user.id || +req.params.uid === m.owner_id) return res.status(403).json({ error: 'Not allowed' });
  q.run('DELETE FROM manuscript_members WHERE manuscript_id = ? AND user_id = ?', m.id, req.params.uid);
  res.json({ ok: true });
});
ms.post('/:id/comments', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (!req.body?.body?.trim()) return res.status(400).json({ error: 'Comment is empty' });
  q.run('INSERT INTO manuscript_comments(manuscript_id, user_id, body) VALUES (?,?,?)', m.id, req.user.id, req.body.body.trim());
  const others = q.all('SELECT user_id FROM manuscript_members WHERE manuscript_id = ? AND user_id != ?', m.id, req.user.id).map((x) => x.user_id);
  notifyMany(others, 'New manuscript comment', `${req.user.name} on "${m.title}"`, `/manuscripts/${m.id}`);
  res.status(201).json({ ok: true });
});
ms.post('/:id/file', upload.single('file'), (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  q.run("UPDATE manuscripts SET file_path = ?, file_name = ?, updated_at = datetime('now') WHERE id = ?", req.file.filename, req.file.originalname, m.id);
  res.json({ ok: true });
});
ms.get('/:id/file', (req, res) => {
  const m = loadMs(req, res); if (!m) return;
  if (!m.file_path) return res.status(404).json({ error: 'No file' });
  res.download(path.join(UPLOAD_DIR, path.basename(m.file_path)), m.file_name);
});
r.use('/manuscripts', ms);

export default r;
