import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import mammoth from 'mammoth';
import { q, UPLOAD_DIR, getSettings } from '../db.js';
import { authenticate, requireRole, isAdmin } from '../lib/auth.js';
import { log, notify, notifyMany, sanitizeHtml, asyncH, stripHtml } from '../lib/util.js';
import { stagesFor, nextStage, stageLabel, progressPct, stageIndex } from '../lib/stages.js';
import { plagiarismCheck, aiCheck } from '../lib/checkers.js';

const r = Router();
r.use(authenticate);
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(docx?|pdf|pptx?|xlsx?|txt|rtf|odt|png|jpe?g|zip)$/i.test(file.originalname)),
});

const P_COLS = `pr.*, su.name AS student_name, su.email AS student_email, su.matric_no, su.department_id, su.faculty_id,
  sv.name AS supervisor_name, sv.title AS supervisor_title, sv.status AS supervisor_status, cs.name AS co_supervisor_name, d.name AS department_name, f.name AS faculty_name,
  pg.name AS program_name, pg.degree AS program_degree,
  (SELECT MAX(created_at) FROM progress_events e WHERE e.project_id = pr.id) AS last_activity,
  (SELECT COUNT(*) FROM submissions s WHERE s.project_id = pr.id AND s.status = 'submitted') AS pending_submissions,
  (SELECT COUNT(*) FROM topics t WHERE t.project_id = pr.id AND t.status = 'pending') AS pending_topics`;
const P_JOIN = `FROM projects pr JOIN users su ON su.id = pr.student_id LEFT JOIN users sv ON sv.id = pr.supervisor_id
  LEFT JOIN users cs ON cs.id = pr.co_supervisor_id LEFT JOIN departments d ON d.id = su.department_id
  LEFT JOIN faculties f ON f.id = su.faculty_id LEFT JOIN programs pg ON pg.id = su.program_id`;

const decorate = (p) => p && ({ ...p, stage_label: stageLabel(p.level, p.stage), progress: progressPct(p.level, p.stage) });

function projectScope(u) {
  if (isAdmin(u)) return ['1=1', []];
  if (u.role === 'dean') return ['(su.faculty_id = ? OR pr.supervisor_id = ? OR pr.co_supervisor_id = ?)', [u.faculty_id, u.id, u.id]];
  if (u.role === 'hod') return ['(su.department_id = ? OR pr.supervisor_id = ? OR pr.co_supervisor_id = ?)', [u.department_id, u.id, u.id]];
  if (u.role === 'lecturer') return ['(pr.supervisor_id = ? OR pr.co_supervisor_id = ?)', [u.id, u.id]];
  return ['pr.student_id = ?', [u.id]];
}

export function getProject(id) { return decorate(q.get(`SELECT ${P_COLS} ${P_JOIN} WHERE pr.id = ?`, id)); }

export function canView(u, p) {
  if (!p) return false;
  if (isAdmin(u) || p.student_id === u.id || p.supervisor_id === u.id || p.co_supervisor_id === u.id) return true;
  if (u.role === 'hod' && p.department_id === u.department_id) return true;
  if (u.role === 'dean' && p.faculty_id === u.faculty_id) return true;
  return false;
}
const isSupervisor = (u, p) => p.supervisor_id === u.id || p.co_supervisor_id === u.id;
const canManageDept = (u, p) => isAdmin(u) || (u.role === 'hod' && p.department_id === u.department_id) || (u.role === 'dean' && p.faculty_id === u.faculty_id);
const canSupervise = (u, p) => isSupervisor(u, p) || canManageDept(u, p);

function event(pid, stage, label, actor, note = null) {
  q.run('INSERT INTO progress_events(project_id, stage, label, actor_id, note) VALUES (?,?,?,?,?)', pid, stage, label, actor, note);
  q.run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", pid);
}

function loadProject(req, res) {
  const p = getProject(req.params.id);
  if (!p || !canView(req.user, p)) { res.status(404).json({ error: 'Project not found' }); return null; }
  return p;
}

// ---------- Listing ----------
r.get('/', (req, res) => {
  const [w, p] = projectScope(req.user);
  const where = [w], params = [...p];
  const { department_id, faculty_id, stage, level, supervisor_id, unallocated, search, mine } = req.query;
  if (mine) { where.push('(pr.supervisor_id = ? OR pr.co_supervisor_id = ?)'); params.push(req.user.id, req.user.id); }
  if (department_id) { where.push('su.department_id = ?'); params.push(department_id); }
  if (faculty_id) { where.push('su.faculty_id = ?'); params.push(faculty_id); }
  if (stage) { where.push('pr.stage = ?'); params.push(stage); }
  if (level) { where.push('pr.level = ?'); params.push(level); }
  if (supervisor_id) { where.push('pr.supervisor_id = ?'); params.push(supervisor_id); }
  if (unallocated) where.push('pr.supervisor_id IS NULL');
  if (search) { where.push('(su.name LIKE ? OR su.matric_no LIKE ? OR pr.title LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  where.push("su.status = 'active'");
  res.json(q.all(`SELECT ${P_COLS} ${P_JOIN} WHERE ${where.join(' AND ')} ORDER BY su.name`, ...params).map(decorate));
});

r.get('/stages', (req, res) => res.json({ UG: stagesFor('UG'), PG: stagesFor('PG') }));

r.get('/mine', (req, res) => {
  const row = q.get('SELECT id FROM projects WHERE student_id = ?', req.user.id);
  res.json(row ? detail(row.id) : null);
});

function detail(id) {
  const p = getProject(id);
  return {
    ...p,
    stages: stagesFor(p.level),
    stage_index: stageIndex(p.level, p.stage),
    supervisor: p.supervisor_id ? q.get('SELECT id, name, title, email, phone, research_interests FROM users WHERE id = ?', p.supervisor_id) : null,
    co_supervisor: p.co_supervisor_id ? q.get('SELECT id, name, title, email FROM users WHERE id = ?', p.co_supervisor_id) : null,
    topics: q.all('SELECT t.*, u.name AS reviewer FROM topics t LEFT JOIN users u ON u.id = t.reviewed_by WHERE t.project_id = ? ORDER BY t.id DESC', id),
    submissions: q.all(`SELECT s.id, s.stage, s.title, s.file_name, s.note, s.status, s.feedback, s.version, s.plagiarism_score, s.ai_score,
      s.created_at, s.reviewed_at, u.name AS reviewer, (s.content_html IS NOT NULL AND s.content_html != '') AS has_content,
      (s.reviewed_html IS NOT NULL) AS annotated,
      (SELECT COUNT(*) FROM submission_comments c WHERE c.submission_id = s.id AND c.parent_id IS NULL AND c.status = 'open') AS open_comments
      FROM submissions s LEFT JOIN users u ON u.id = s.reviewed_by WHERE s.project_id = ? ORDER BY s.id DESC`, id),
    events: q.all('SELECT e.*, u.name AS actor FROM progress_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.project_id = ? ORDER BY e.id DESC', id),
    defenses: q.all('SELECT * FROM defenses WHERE project_id = ? ORDER BY scheduled_at DESC', id),
  };
}

// ---------- Supervisor allocation ----------
r.get('/supervisors', requireRole('hod', 'dean', 'superadmin', 'sysadmin'), (req, res) => {
  const dept = req.query.department_id || req.user.department_id;
  const fac = q.get('SELECT faculty_id FROM departments WHERE id = ?', dept)?.faculty_id || req.user.faculty_id;
  res.json(q.all(`SELECT u.id, u.name, u.title, u.role, u.research_interests, u.department_id, d.name AS department_name,
      (SELECT COUNT(*) FROM projects p WHERE p.supervisor_id = u.id AND p.stage != 'completed') AS load,
      (SELECT COUNT(*) FROM projects p WHERE p.co_supervisor_id = u.id AND p.stage != 'completed') AS co_load
    FROM users u LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role IN ('lecturer','hod','dean') AND u.status = 'active' AND (u.department_id = ? OR u.faculty_id = ?)
    ORDER BY (u.department_id = ?) DESC, load, u.name`, dept, fac, dept));
});

r.get('/:id', (req, res) => { const p = loadProject(req, res); if (p) res.json(detail(p.id)); });

r.put('/:id', (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (!(p.student_id === req.user.id || canSupervise(req.user, p))) return res.status(403).json({ error: 'Not allowed' });
  q.run('UPDATE projects SET abstract = COALESCE(?, abstract), title = COALESCE(?, title) WHERE id = ?', req.body?.abstract, canSupervise(req.user, p) ? req.body?.title : null, p.id);
  res.json(detail(p.id));
});

function allocate(actor, p, supervisorId, coId) {
  const sup = supervisorId ? q.get("SELECT * FROM users WHERE id = ? AND role IN ('lecturer','hod','dean') AND status='active'", supervisorId) : null;
  if (supervisorId && !sup) throw Object.assign(new Error('Selected supervisor is not active academic staff'), { status: 400 });
  q.run('UPDATE projects SET supervisor_id = ?, co_supervisor_id = ?, substatus = ? WHERE id = ?', sup?.id, coId || null,
    sup ? (p.stage === 'registered' ? 'Submit project topics' : 'In progress') : 'Awaiting supervisor allocation', p.id);
  if (sup && p.stage === 'registered') q.run("UPDATE projects SET stage = 'topic' WHERE id = ?", p.id);
  event(p.id, p.stage, sup ? `Supervisor allocated: ${sup.title || ''} ${sup.name}`.replace('  ', ' ') : 'Supervisor removed', actor.id);
  log(actor.id, 'Allocated supervisor', 'project', p.id, `${p.student_name} → ${sup?.name || 'none'}`);
  if (sup) {
    notify(p.student_id, 'Supervisor allocated', `${sup.title || ''} ${sup.name} is now your project supervisor.`, '/my-project');
    notify(sup.id, 'New student allocated', `${p.student_name} (${p.matric_no}) has been allocated to you for supervision.`, `/projects/${p.id}`);
  }
  if (coId) notify(coId, 'Co-supervision assignment', `You are co-supervisor for ${p.student_name}.`, `/projects/${p.id}`);
}

r.post('/:id/allocate', requireRole('hod', 'dean', 'superadmin', 'sysadmin'), (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (!canManageDept(req.user, p)) return res.status(403).json({ error: 'Only the HOD of this department can allocate supervisors' });
  try { allocate(req.user, p, req.body?.supervisor_id, req.body?.co_supervisor_id); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  res.json(detail(p.id));
});

/** Balanced auto-allocation: unallocated students in the department go to the least-loaded staff, preferring research-interest matches. */
r.post('/auto-allocate', requireRole('hod', 'superadmin', 'sysadmin'), (req, res) => {
  const dept = req.user.role === 'hod' ? req.user.department_id : req.body?.department_id;
  if (!dept) return res.status(400).json({ error: 'Department required' });
  const staff = q.all(`SELECT u.id, u.name, u.research_interests, (SELECT COUNT(*) FROM projects p WHERE p.supervisor_id = u.id AND p.stage != 'completed') AS load
    FROM users u WHERE u.role IN ('lecturer','hod') AND u.status='active' AND u.department_id = ?`, dept);
  if (!staff.length) return res.status(400).json({ error: 'No active lecturers in this department' });
  const pending = q.all(`SELECT pr.id FROM projects pr JOIN users su ON su.id = pr.student_id WHERE su.department_id = ? AND su.status='active' AND pr.supervisor_id IS NULL`, dept);
  const cap = +req.body?.max_per_supervisor || 15;
  let n = 0;
  for (const { id } of pending) {
    const p = getProject(id);
    const words = `${p.title || ''} ${p.abstract || ''}`.toLowerCase();
    const scored = staff.filter((s) => s.load < cap).map((s) => ({
      s, score: s.load - (s.research_interests || '').toLowerCase().split(/[,;]+/).filter((k) => k.trim() && words.includes(k.trim())).length * 2,
    })).sort((a, b) => a.score - b.score);
    if (!scored.length) break;
    allocate(req.user, p, scored[0].s.id, null);
    scored[0].s.load++; n++;
  }
  res.json({ allocated: n, remaining: pending.length - n });
});

// ---------- Topics ----------
r.post('/:id/topics', (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (p.student_id !== req.user.id) return res.status(403).json({ error: 'Only the student can propose topics' });
  if (!p.supervisor_id) return res.status(400).json({ error: 'You can submit topics once a supervisor has been allocated' });
  if (q.get("SELECT id FROM topics WHERE project_id = ? AND status = 'approved'", p.id)) return res.status(400).json({ error: 'Your topic has already been approved' });
  const items = (Array.isArray(req.body?.topics) ? req.body.topics : [req.body]).filter((t) => t?.title?.trim());
  if (!items.length) return res.status(400).json({ error: 'Enter at least one topic' });
  if (q.get("SELECT COUNT(*) AS n FROM topics WHERE project_id = ? AND status = 'pending'", p.id).n + items.length > 3) return res.status(400).json({ error: 'You can have at most 3 topics pending review' });
  for (const t of items) q.run('INSERT INTO topics(project_id, title, description) VALUES (?,?,?)', p.id, t.title.trim(), t.description);
  q.run("UPDATE projects SET substatus = 'Topic under review', stage = CASE WHEN stage = 'registered' THEN 'topic' ELSE stage END WHERE id = ?", p.id);
  event(p.id, 'topic', `${items.length} topic(s) submitted`, req.user.id);
  log(req.user.id, 'Submitted project topics', 'project', p.id, items.map((t) => t.title).join(' | '));
  notifyMany([p.supervisor_id, p.co_supervisor_id], 'New topic proposal', `${p.student_name} submitted ${items.length} topic(s) for review.`, `/projects/${p.id}`);
  res.status(201).json(detail(p.id));
});

r.put('/topics/:tid', (req, res) => {
  const t = q.get('SELECT * FROM topics WHERE id = ?', req.params.tid);
  const p = t && getProject(t.project_id);
  if (!p || !canSupervise(req.user, p)) return res.status(403).json({ error: 'Only the supervisor can review topics' });
  const { action, refined_title, feedback } = req.body || {};
  const status = { approve: 'approved', reject: 'rejected', revise: 'needs_revision' }[action];
  if (!status) return res.status(400).json({ error: 'Invalid action' });
  q.run("UPDATE topics SET status = ?, refined_title = ?, feedback = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?",
    status, refined_title?.trim() || null, feedback, req.user.id, t.id);
  if (status === 'approved') {
    const title = refined_title?.trim() || t.title;
    const next = nextStage(p.level, 'topic');
    q.run("UPDATE topics SET status = 'rejected', feedback = COALESCE(feedback, 'Another topic was approved') WHERE project_id = ? AND id != ? AND status = 'pending'", p.id, t.id);
    q.run('UPDATE projects SET title = ?, stage = ?, substatus = ? WHERE id = ?', title, next, `Start ${stageLabel(p.level, next)}`, p.id);
    event(p.id, 'topic', 'Topic approved', req.user.id, title);
    notify(p.student_id, 'Topic approved 🎉', `"${title}" — you can now start ${stageLabel(p.level, next)}.`, '/my-project');
  } else {
    q.run('UPDATE projects SET substatus = ? WHERE id = ?', status === 'needs_revision' ? 'Revise topic' : 'Topic rejected – submit another', p.id);
    event(p.id, 'topic', status === 'needs_revision' ? 'Topic returned for refinement' : 'Topic rejected', req.user.id, feedback);
    notify(p.student_id, status === 'needs_revision' ? 'Topic needs refinement' : 'Topic not approved', feedback || t.title, '/my-project');
  }
  log(req.user.id, `Topic ${status}`, 'topic', t.id, t.title);
  res.json(detail(p.id));
});

// ---------- Submissions ----------
r.post('/:id/submissions', upload.single('file'), asyncH(async (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (p.student_id !== req.user.id) return res.status(403).json({ error: 'Only the student can submit work' });
  if (!p.supervisor_id) return res.status(400).json({ error: 'No supervisor allocated yet' });
  const b = req.body || {};
  const st = stagesFor(p.level).find((s) => s.key === b.stage);
  if (!st || !st.doc) return res.status(400).json({ error: 'Select a valid stage for this submission' });
  if (stageIndex(p.level, b.stage) > stageIndex(p.level, p.stage)) return res.status(400).json({ error: `You must complete ${p.stage_label} first` });
  let html = sanitizeHtml(b.content_html || '');
  if (req.file && /\.docx$/i.test(req.file.originalname) && !stripHtml(html)) {
    try { html = (await mammoth.convertToHtml({ path: req.file.path })).value; } catch { /* keep file only */ }
  }
  if (!req.file && !stripHtml(html)) return res.status(400).json({ error: 'Attach a file or write content in the editor' });
  const plag = stripHtml(html) ? plagiarismCheck(html, req.user.id).score : null;
  const ai = stripHtml(html) ? aiCheck(html).score : null;
  const version = q.get('SELECT COUNT(*) AS n FROM submissions WHERE project_id = ? AND stage = ?', p.id, b.stage).n + 1;
  const id = q.run(`INSERT INTO submissions(project_id, stage, title, content_html, file_path, file_name, note, version, plagiarism_score, ai_score)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, p.id, b.stage, b.title || st.label, html || null, req.file?.filename, req.file?.originalname, b.note, version, plag, ai).id;
  q.run("UPDATE projects SET substatus = 'Awaiting supervisor review' WHERE id = ?", p.id);
  event(p.id, b.stage, `${st.label} submitted (v${version})`, req.user.id, b.note);
  log(req.user.id, 'Submitted work', 'submission', id, `${st.label} v${version}`);
  notifyMany([p.supervisor_id, p.co_supervisor_id], 'New submission to review', `${p.student_name} submitted ${st.label} (version ${version}).`, `/projects/${p.id}`);
  res.status(201).json(detail(p.id));
}));

r.get('/submissions/:sid', (req, res) => {
  const s = q.get('SELECT * FROM submissions WHERE id = ?', req.params.sid);
  const p = s && getProject(s.project_id);
  if (!p || !canView(req.user, p)) return res.status(404).json({ error: 'Submission not found' });
  res.json({
    ...s, stage_label: stageLabel(p.level, s.stage), student_name: p.student_name, student_id: p.student_id,
    can_review: canSupervise(req.user, p), can_reply: canSupervise(req.user, p) || p.student_id === req.user.id,
    comments: submissionComments(s.id),
  });
});

// ---------- Inline review: annotated copy + highlighted comments ----------
const COMMENT_COLORS = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple'];
const submissionComments = (sid) => q.all(`SELECT c.*, u.name AS author, u.title AS author_title, u.role AS author_role
  FROM submission_comments c JOIN users u ON u.id = c.user_id WHERE c.submission_id = ? ORDER BY c.id`, sid);

function loadSubmission(req, res) {
  const s = q.get('SELECT * FROM submissions WHERE id = ?', req.params.sid);
  const p = s && getProject(s.project_id);
  if (!p || !canView(req.user, p)) { res.status(404).json({ error: 'Submission not found' }); return []; }
  return [s, p];
}
const saveAnnotated = (s, html, userId) => q.run("UPDATE submissions SET reviewed_html = ?, annotated_by = ?, annotated_at = datetime('now') WHERE id = ?", sanitizeHtml(html), userId, s.id);

/** Supervisor saves the annotated/edited copy (highlights + inline text edits). The original content_html is untouched. */
r.put('/submissions/:sid/annotate', (req, res) => {
  const [s, p] = loadSubmission(req, res); if (!s) return;
  if (!canSupervise(req.user, p)) return res.status(403).json({ error: 'Only the supervisor can edit or annotate this submission' });
  if (typeof req.body?.html !== 'string') return res.status(400).json({ error: 'Missing content' });
  saveAnnotated(s, req.body.html, req.user.id);
  log(req.user.id, 'Annotated submission', 'submission', s.id, `${p.student_name} – ${stageLabel(p.level, s.stage)} v${s.version}`);
  res.json({ ok: true, annotated_at: q.get('SELECT annotated_at FROM submissions WHERE id = ?', s.id).annotated_at });
});

/** Highlighted comment (supervisor, anchored by `cid` to a <mark> in the annotated copy) or a reply (supervisor or student). */
r.post('/submissions/:sid/comments', (req, res) => {
  const [s, p] = loadSubmission(req, res); if (!s) return;
  const b = req.body || {};
  const reviewer = canSupervise(req.user, p);
  if (!reviewer && p.student_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  if (b.parent_id) {
    const parent = q.get('SELECT * FROM submission_comments WHERE id = ? AND submission_id = ?', b.parent_id, s.id);
    if (!parent) return res.status(404).json({ error: 'Comment not found' });
    if (!b.body?.trim()) return res.status(400).json({ error: 'Reply is empty' });
    q.run('INSERT INTO submission_comments(submission_id, user_id, parent_id, body) VALUES (?,?,?,?)', s.id, req.user.id, parent.id, b.body.trim());
    const to = reviewer ? [p.student_id] : [p.supervisor_id, p.co_supervisor_id];
    notifyMany(to, 'New reply on review comment', `${req.user.name}: ${b.body.trim().slice(0, 120)}`, `/projects/${p.id}`);
  } else {
    if (!reviewer) return res.status(403).json({ error: 'Only the supervisor can add highlighted comments' });
    if (!b.cid || !/^[\w-]{4,40}$/.test(b.cid)) return res.status(400).json({ error: 'Invalid highlight reference' });
    if (!COMMENT_COLORS.includes(b.color)) return res.status(400).json({ error: 'Invalid highlighter colour' });
    q.tx(() => {
      q.run('INSERT INTO submission_comments(submission_id, user_id, cid, color, category, quote, body) VALUES (?,?,?,?,?,?,?)',
        s.id, req.user.id, b.cid, b.color, String(b.category || '').slice(0, 60), String(b.quote || '').slice(0, 500), String(b.body || '').trim());
      if (typeof b.html === 'string') saveAnnotated(s, b.html, req.user.id);
    });
  }
  res.status(201).json({ comments: submissionComments(s.id), reviewed_html: q.get('SELECT reviewed_html FROM submissions WHERE id = ?', s.id).reviewed_html });
});

/** Resolve / reopen (student or supervisor), withdraw (author or supervisor), or edit text (author only). Nothing is deleted. */
r.put('/submissions/:sid/comments/:cid', (req, res) => {
  const [s, p] = loadSubmission(req, res); if (!s) return;
  const c = q.get('SELECT * FROM submission_comments WHERE id = ? AND submission_id = ?', req.params.cid, s.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  const reviewer = canSupervise(req.user, p);
  if (!reviewer && p.student_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  if (b.status) {
    if (!['open', 'resolved', 'withdrawn'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
    if (b.status === 'withdrawn' && !(reviewer || c.user_id === req.user.id)) return res.status(403).json({ error: 'Only the supervisor can withdraw this comment' });
  }
  if (b.body !== undefined && c.user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own comments' });
  q.tx(() => {
    q.run("UPDATE submission_comments SET status = COALESCE(?, status), body = COALESCE(?, body), updated_at = datetime('now') WHERE id = ?", b.status, b.body?.trim(), c.id);
    if (typeof b.html === 'string' && reviewer) saveAnnotated(s, b.html, req.user.id); // e.g. highlight removed on withdraw
  });
  if (b.status === 'resolved' && !reviewer) notifyMany([p.supervisor_id, p.co_supervisor_id], 'Comment resolved', `${p.student_name} resolved: "${(c.quote || c.body).slice(0, 80)}"`, `/projects/${p.id}`);
  res.json({ comments: submissionComments(s.id), reviewed_html: q.get('SELECT reviewed_html FROM submissions WHERE id = ?', s.id).reviewed_html });
});

r.get('/submissions/:sid/file', (req, res) => {
  const s = q.get('SELECT * FROM submissions WHERE id = ?', req.params.sid);
  const p = s && getProject(s.project_id);
  if (!p || !canView(req.user, p) || !s.file_path) return res.status(404).json({ error: 'File not found' });
  const fp = path.join(UPLOAD_DIR, path.basename(s.file_path));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing on server' });
  res.download(fp, s.file_name);
});

r.put('/submissions/:sid/review', (req, res) => {
  const s = q.get('SELECT * FROM submissions WHERE id = ?', req.params.sid);
  const p = s && getProject(s.project_id);
  if (!p || !canSupervise(req.user, p)) return res.status(403).json({ error: 'Only the supervisor can review this submission' });
  const { action, feedback } = req.body || {};
  const status = { approve: 'approved', corrections: 'corrections' }[action];
  if (!status) return res.status(400).json({ error: 'Invalid action' });
  const openComments = q.get("SELECT COUNT(*) AS n FROM submission_comments WHERE submission_id = ? AND parent_id IS NULL AND status = 'open'", s.id).n;
  if (status === 'corrections' && !feedback?.trim() && !openComments) return res.status(400).json({ error: 'Describe the corrections required, or add inline comments on the text' });
  q.run("UPDATE submissions SET status = ?, feedback = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?", status, feedback, req.user.id, s.id);
  const label = stageLabel(p.level, s.stage);
  const inline = openComments ? ` (${openComments} inline comment${openComments === 1 ? '' : 's'} on your text)` : '';
  if (status === 'approved') {
    if (s.stage === p.stage) {
      const next = nextStage(p.level, p.stage);
      q.run('UPDATE projects SET stage = ?, substatus = ? WHERE id = ?', next, `Start ${stageLabel(p.level, next)}`, p.id);
    } else q.run("UPDATE projects SET substatus = 'In progress' WHERE id = ?", p.id);
    event(p.id, s.stage, `${label} approved`, req.user.id, feedback);
    notify(p.student_id, `${label} approved ✅`, (feedback || 'Proceed to the next stage.') + inline, '/my-project');
  } else {
    q.run("UPDATE projects SET substatus = 'Make corrections' WHERE id = ?", p.id);
    event(p.id, s.stage, `Corrections requested on ${label}`, req.user.id, feedback);
    notify(p.student_id, `Corrections on ${label}`, (feedback || 'See the highlighted comments on your submission.') + inline, '/my-project');
  }
  log(req.user.id, `Reviewed submission: ${status}`, 'submission', s.id, `${p.student_name} – ${label}`);
  res.json(detail(p.id));
});

// Manual stage updates (seminars, defense, completion)
r.post('/:id/stage', (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (!canSupervise(req.user, p)) return res.status(403).json({ error: 'Not allowed' });
  const { stage, note, substatus } = req.body || {};
  if (stageIndex(p.level, stage) < 0) return res.status(400).json({ error: 'Invalid stage' });
  q.run('UPDATE projects SET stage = ?, substatus = ? WHERE id = ?', stage, substatus || (stage === 'completed' ? 'Completed' : 'In progress'), p.id);
  event(p.id, stage, `Stage set to ${stageLabel(p.level, stage)}`, req.user.id, note);
  log(req.user.id, 'Updated project stage', 'project', p.id, `${p.student_name} → ${stageLabel(p.level, stage)}`);
  notify(p.student_id, 'Project stage updated', `Your project is now at: ${stageLabel(p.level, stage)}`, '/my-project');
  res.json(detail(p.id));
});

// ---------- Defenses / seminars ----------
r.get('/defenses/list', (req, res) => {
  const [w, p] = projectScope(req.user);
  res.json(q.all(`SELECT df.*, su.name AS student_name, su.matric_no, pr.title AS project_title, pr.level, d.name AS department_name
    FROM defenses df JOIN projects pr ON pr.id = df.project_id JOIN users su ON su.id = pr.student_id
    LEFT JOIN departments d ON d.id = su.department_id WHERE ${w} ORDER BY df.scheduled_at DESC`, ...p));
});

r.post('/:id/defenses', (req, res) => {
  const p = loadProject(req, res); if (!p) return;
  if (!canManageDept(req.user, p)) return res.status(403).json({ error: 'Only the HOD/Dean can schedule defenses' });
  const b = req.body || {};
  if (!b.type || !b.scheduled_at) return res.status(400).json({ error: 'Type and date/time are required' });
  const id = q.run('INSERT INTO defenses(project_id, type, scheduled_at, venue, panel, created_by) VALUES (?,?,?,?,?,?)', p.id, b.type, b.scheduled_at, b.venue, b.panel, req.user.id).id;
  event(p.id, p.stage, `${b.type} scheduled for ${b.scheduled_at.replace('T', ' ')}`, req.user.id, b.venue);
  log(req.user.id, 'Scheduled defense', 'defense', id, `${p.student_name} – ${b.type}`);
  notifyMany([p.student_id, p.supervisor_id, p.co_supervisor_id], `${b.type} scheduled`, `${p.student_name}: ${b.scheduled_at.replace('T', ' ')} at ${b.venue || 'TBA'}`, `/projects/${p.id}`);
  res.status(201).json(detail(p.id));
});

r.put('/defenses/:did', (req, res) => {
  const d = q.get('SELECT * FROM defenses WHERE id = ?', req.params.did);
  const p = d && getProject(d.project_id);
  if (!p || !canManageDept(req.user, p)) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  q.run('UPDATE defenses SET status = COALESCE(?, status), remarks = COALESCE(?, remarks), scheduled_at = COALESCE(?, scheduled_at), venue = COALESCE(?, venue), panel = COALESCE(?, panel) WHERE id = ?',
    b.status, b.remarks, b.scheduled_at, b.venue, b.panel, d.id);
  event(p.id, p.stage, `${d.type}: ${b.status || 'updated'}`, req.user.id, b.remarks);
  notify(p.student_id, `${d.type} ${b.status || 'updated'}`, b.remarks || '', '/my-project');
  res.json(detail(p.id));
});

// ---------- Lecturer review queue ----------
r.get('/reviews/pending', (req, res) => {
  const me = req.user.id;
  res.json({
    topics: q.all(`SELECT t.*, su.name AS student_name, pr.id AS project_id FROM topics t JOIN projects pr ON pr.id = t.project_id
      JOIN users su ON su.id = pr.student_id WHERE t.status = 'pending' AND (pr.supervisor_id = ? OR pr.co_supervisor_id = ?) ORDER BY t.created_at`, me, me),
    submissions: q.all(`SELECT s.id, s.stage, s.title, s.version, s.created_at, s.plagiarism_score, s.ai_score, su.name AS student_name, pr.id AS project_id, pr.level
      FROM submissions s JOIN projects pr ON pr.id = s.project_id JOIN users su ON su.id = pr.student_id
      WHERE s.status = 'submitted' AND (pr.supervisor_id = ? OR pr.co_supervisor_id = ?) ORDER BY s.created_at`, me, me)
      .map((s) => ({ ...s, stage_label: stageLabel(s.level, s.stage) })),
  });
});

// ---------- Reports ----------
r.get('/reports/progress', requireRole('dean', 'hod', 'superadmin', 'sysadmin', 'lecturer'), (req, res) => {
  const [w, p] = projectScope(req.user);
  const where = [w, "su.status = 'active'"], params = [...p];
  for (const [k, col] of [['faculty_id', 'su.faculty_id'], ['department_id', 'su.department_id'], ['level', 'pr.level'], ['supervisor_id', 'pr.supervisor_id']]) {
    if (req.query[k]) { where.push(`${col} = ?`); params.push(req.query[k]); }
  }
  const rows = q.all(`SELECT ${P_COLS} ${P_JOIN} WHERE ${where.join(' AND ')} ORDER BY d.name, su.name`, ...params).map(decorate)
    .map((x) => ({ ...x, idle_days: x.last_activity ? Math.floor((Date.now() - new Date(x.last_activity + 'Z').getTime()) / 864e5) : null }));
  const bySup = {};
  for (const x of rows) {
    const k = x.supervisor_name || '— Unallocated —';
    bySup[k] ||= { supervisor: k, students: 0, avg: 0, completed: 0, pending: 0 };
    bySup[k].students++; bySup[k].avg += x.progress; bySup[k].completed += x.stage === 'completed' ? 1 : 0; bySup[k].pending += x.pending_submissions + x.pending_topics;
  }
  const supervisors = Object.values(bySup).map((s) => ({ ...s, avg: Math.round(s.avg / s.students) }));
  res.json({
    generated_at: new Date().toISOString(), session: getSettings().session, rows, supervisors,
    summary: {
      total: rows.length, completed: rows.filter((x) => x.stage === 'completed').length, unallocated: rows.filter((x) => !x.supervisor_id).length,
      corrections: rows.filter((x) => x.substatus === 'Make corrections').length, idle30: rows.filter((x) => x.idle_days >= 30).length,
      avgProgress: rows.length ? Math.round(rows.reduce((a, x) => a + x.progress, 0) / rows.length) : 0,
    },
  });
});

export default r;
