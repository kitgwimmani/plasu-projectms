import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, getSettings, setSetting, archiveRow, restoreRow } from '../db.js';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';
import { log, notify } from '../lib/util.js';
import { userDetail } from './auth.js';

const r = Router();
r.use(authenticate);
const ADMIN = ['superadmin', 'sysadmin'];

/** SQL filter restricting user lists to what the caller may see. */
function scope(u, alias = 'u') {
  if (ADMIN.includes(u.role)) return ['1=1', []];
  if (u.role === 'dean') return [`${alias}.faculty_id = ?`, [u.faculty_id]];
  if (u.role === 'hod') return [`${alias}.department_id = ?`, [u.department_id]];
  return ['0=1', []];
}

const USER_COLS = `u.id, u.name, u.email, u.role, u.status, u.title, u.phone, u.faculty_id, u.department_id, u.program_id, u.matric_no,
  u.staff_id, u.level, u.research_interests, u.last_login, u.created_at, f.name AS faculty_name, d.name AS department_name, p.name AS program_name`;
const USER_JOIN = 'FROM users u LEFT JOIN faculties f ON f.id = u.faculty_id LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN programs p ON p.id = u.program_id';

// ---------- Users ----------
r.get('/users', requireRole('superadmin', 'sysadmin', 'dean', 'hod'), (req, res) => {
  const [w, p] = scope(req.user);
  const where = [w], params = [...p];
  const { role, status, department_id, faculty_id, search } = req.query;
  if (role === 'admins') where.push("u.role IN ('superadmin','sysadmin','dean','hod')");
  else if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); } else where.push("u.status != 'deactivated'");
  if (department_id) { where.push('u.department_id = ?'); params.push(department_id); }
  if (faculty_id) { where.push('u.faculty_id = ?'); params.push(faculty_id); }
  if (search) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.matric_no LIKE ? OR u.staff_id LIKE ?)'); params.push(...Array(4).fill(`%${search}%`)); }
  res.json(q.all(`SELECT ${USER_COLS} ${USER_JOIN} WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 1000`, ...params));
});

function canManage(actor, targetRole) {
  if (actor.role === 'superadmin') return true;
  if (actor.role === 'sysadmin') return !['superadmin', 'sysadmin'].includes(targetRole);
  return false;
}

r.post('/users', requireRole(...ADMIN), (req, res) => {
  const b = req.body || {};
  if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid role' });
  if (!canManage(req.user, b.role)) return res.status(403).json({ error: 'Only the super admin can create system administrators' });
  if (!b.name || !b.email || !b.password) return res.status(400).json({ error: 'Name, email and an initial password are required' });
  if (q.get('SELECT id FROM users WHERE email = ?', b.email)) return res.status(409).json({ error: 'Email already in use' });
  const dept = b.department_id ? q.get('SELECT * FROM departments WHERE id = ?', b.department_id) : null;
  const prog = b.program_id ? q.get('SELECT * FROM programs WHERE id = ?', b.program_id) : null;
  const id = q.run(`INSERT INTO users(name, email, password_hash, role, status, title, phone, faculty_id, department_id, program_id, matric_no, staff_id, level, approved_by)
    VALUES (?,?,?,?,'active',?,?,?,?,?,?,?,?,?)`, b.name, b.email, bcrypt.hashSync(b.password, 10), b.role, b.title, b.phone,
    dept?.faculty_id ?? b.faculty_id, dept?.id, prog?.id, b.matric_no, b.staff_id, prog?.level || b.level, req.user.id).id;
  if (b.role === 'student') ensureProject(id);
  syncHeadship(id);
  log(req.user.id, `Created ${b.role} account`, 'user', id, `${b.name} <${b.email}>`);
  res.status(201).json(userDetail(id));
});

r.put('/users/:id', requireRole(...ADMIN), (req, res) => {
  const t = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  const newRole = b.role || t.role;
  if (!canManage(req.user, t.role) || !canManage(req.user, newRole)) return res.status(403).json({ error: 'You cannot modify this account' });
  if (t.id === req.user.id && newRole !== t.role) return res.status(400).json({ error: 'You cannot change your own role' });
  if (b.status && b.status !== t.status && (b.status === 'deactivated' || t.status === 'deactivated')) {
    return res.status(400).json({ error: 'Use the Deactivate / Reactivate actions to change this account’s active state' });
  }
  if (b.email && b.email !== t.email && q.get('SELECT id FROM users WHERE email = ? AND id != ?', b.email, t.id)) return res.status(409).json({ error: 'Email already in use' });
  const dept = b.department_id ? q.get('SELECT * FROM departments WHERE id = ?', b.department_id) : null;
  const prog = b.program_id ? q.get('SELECT * FROM programs WHERE id = ?', b.program_id) : null;
  q.run(`UPDATE users SET name=?, email=?, role=?, status=?, title=?, phone=?, faculty_id=?, department_id=?, program_id=?, matric_no=?, staff_id=?, level=? WHERE id=?`,
    b.name ?? t.name, b.email ?? t.email, newRole, b.status ?? t.status, b.title ?? t.title, b.phone ?? t.phone,
    dept ? dept.faculty_id : (b.faculty_id !== undefined ? b.faculty_id || null : t.faculty_id),
    b.department_id !== undefined ? b.department_id || null : t.department_id,
    b.program_id !== undefined ? b.program_id || null : t.program_id, b.matric_no ?? t.matric_no, b.staff_id ?? t.staff_id,
    prog?.level || b.level || t.level, t.id);
  if (b.password) q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(b.password, 10), t.id);
  if (newRole === 'student') ensureProject(t.id);
  syncHeadship(t.id);
  log(req.user.id, `Updated account${b.password ? ' (password reset)' : ''}`, 'user', t.id, `${t.name}: ${Object.keys(b).filter((k) => k !== 'password').join(', ')}`);
  if (b.status && b.status !== t.status) notify(t.id, `Account ${b.status}`, `Your account status is now ${b.status}.`);
  res.json(userDetail(t.id));
});

/**
 * Accounts are never deleted (that would cascade away projects, submissions, chats and audit history).
 * Deactivation blocks sign-in, vacates any Dean/HOD office, and — when confirmed with `force` —
 * hands active supervisees to their co-supervisor or back to the HOD for reallocation.
 */
r.post('/users/:id/deactivate', requireRole(...ADMIN), (req, res) => {
  const t = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (!canManage(req.user, t.role)) return res.status(403).json({ error: 'You cannot deactivate this account' });
  if (t.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account' });
  if (t.status === 'deactivated') return res.status(400).json({ error: 'Account is already deactivated' });

  const supervised = q.all(`SELECT p.*, su.name AS student_name, su.department_id FROM projects p JOIN users su ON su.id = p.student_id
    WHERE (p.supervisor_id = ? OR p.co_supervisor_id = ?) AND p.stage != 'completed' AND su.status = 'active'`, t.id, t.id);
  if (supervised.length && !req.body?.force) {
    return res.status(409).json({
      code: 'HAS_SUPERVISEES', count: supervised.length,
      error: `${t.name} supervises ${supervised.length} active student(s). Deactivating will pass them to their co-supervisor where one exists, or mark them for reallocation by the HOD.`,
    });
  }
  q.tx(() => {
    q.run("UPDATE users SET status = 'deactivated', archived_at = datetime('now'), archived_by = ? WHERE id = ?", req.user.id, t.id);
    q.run('UPDATE faculties SET dean_id = NULL WHERE dean_id = ?', t.id);
    q.run('UPDATE departments SET hod_id = NULL WHERE hod_id = ?', t.id);
    for (const p of supervised) {
      if (p.supervisor_id === t.id) {
        const next = p.co_supervisor_id && p.co_supervisor_id !== t.id ? p.co_supervisor_id : null;
        q.run('UPDATE projects SET supervisor_id = ?, co_supervisor_id = NULL, substatus = ? WHERE id = ?', next, next ? 'In progress' : 'Awaiting supervisor reallocation', p.id);
        q.run('INSERT INTO progress_events(project_id, stage, label, actor_id) VALUES (?,?,?,?)', p.id, p.stage,
          next ? `Supervisor ${t.name} deactivated — co-supervisor is now main supervisor` : `Supervisor ${t.name} deactivated — awaiting reallocation`, req.user.id);
        notify(p.student_id, 'Supervisor change', next ? 'Your co-supervisor is now your main supervisor.' : 'Your supervisor is no longer active. Your HOD will allocate a new supervisor.', '/my-project');
        const hod = q.get('SELECT hod_id FROM departments WHERE id = ?', p.department_id)?.hod_id;
        if (!next) notify(hod, 'Student needs a new supervisor', `${p.student_name}'s supervisor (${t.name}) was deactivated.`, `/projects/${p.id}`);
      } else {
        q.run('UPDATE projects SET co_supervisor_id = NULL WHERE id = ?', p.id);
        q.run('INSERT INTO progress_events(project_id, stage, label, actor_id) VALUES (?,?,?,?)', p.id, p.stage, `Co-supervisor ${t.name} deactivated`, req.user.id);
      }
    }
  });
  log(req.user.id, 'Deactivated account', 'user', t.id, `${t.name} <${t.email}>${supervised.length ? `; ${supervised.length} supervisee(s) handed over` : ''}`);
  res.json({ ok: true, reassigned: supervised.length });
});

r.post('/users/:id/reactivate', requireRole(...ADMIN), (req, res) => {
  const t = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (!canManage(req.user, t.role)) return res.status(403).json({ error: 'You cannot reactivate this account' });
  if (t.status !== 'deactivated') return res.status(400).json({ error: 'Account is not deactivated' });
  q.run("UPDATE users SET status = 'active', archived_at = NULL, archived_by = NULL WHERE id = ?", t.id);
  // Restore a Dean/HOD office only if nobody else has been appointed in the meantime.
  const office = t.role === 'hod' ? q.get('SELECT hod_id AS head FROM departments WHERE id = ?', t.department_id)
    : t.role === 'dean' ? q.get('SELECT dean_id AS head FROM faculties WHERE id = ?', t.faculty_id) : null;
  if (office && office.head && office.head !== t.id) q.run("UPDATE users SET role = 'lecturer' WHERE id = ?", t.id);
  else syncHeadship(t.id);
  if (t.role === 'student') ensureProject(t.id);
  log(req.user.id, 'Reactivated account', 'user', t.id, `${t.name} <${t.email}>`);
  notify(t.id, 'Account reactivated', 'Welcome back — your account is active again.');
  res.json(userDetail(t.id));
});

/** Keeps faculties.dean_id / departments.hod_id consistent with a user's role. */
function syncHeadship(id) {
  const u = q.get('SELECT * FROM users WHERE id = ?', id);
  q.run('UPDATE departments SET hod_id = NULL WHERE hod_id = ? AND (? != \'hod\' OR id != ?)', id, u.role, u.department_id);
  q.run('UPDATE faculties SET dean_id = NULL WHERE dean_id = ? AND (? != \'dean\' OR id != ?)', id, u.role, u.faculty_id);
  if (u.role === 'hod' && u.department_id) q.run('UPDATE departments SET hod_id = ? WHERE id = ?', id, u.department_id);
  if (u.role === 'dean' && u.faculty_id) q.run('UPDATE faculties SET dean_id = ? WHERE id = ?', id, u.faculty_id);
}

export function ensureProject(studentId) {
  const s = q.get('SELECT * FROM users WHERE id = ?', studentId);
  if (!s || s.role !== 'student') return;
  if (!q.get('SELECT id FROM projects WHERE student_id = ?', studentId)) {
    const pid = q.run('INSERT INTO projects(student_id, level, session) VALUES (?,?,?)', studentId, s.level || 'UG', getSettings().session).id;
    q.run('INSERT INTO progress_events(project_id, stage, label) VALUES (?,?,?)', pid, 'registered', 'Registration approved');
  }
}

// ---------- Registration approvals (HOD for own department; admins for all) ----------
r.get('/approvals', requireRole('hod', 'dean', ...ADMIN), (req, res) => {
  const [w, p] = scope(req.user);
  res.json(q.all(`SELECT ${USER_COLS} ${USER_JOIN} WHERE u.status = 'pending' AND ${w} ORDER BY u.created_at`, ...p));
});

r.post('/approvals/:id', requireRole('hod', ...ADMIN), (req, res) => {
  const t = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!t || t.status !== 'pending') return res.status(404).json({ error: 'Pending request not found' });
  if (req.user.role === 'hod' && t.department_id !== req.user.department_id) return res.status(403).json({ error: 'This request belongs to another department' });
  const approve = req.body?.action === 'approve';
  q.run('UPDATE users SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?', approve ? 'active' : 'rejected', req.user.id, approve ? null : req.body?.reason || null, t.id);
  if (approve) ensureProject(t.id);
  log(req.user.id, approve ? 'Approved registration' : 'Rejected registration', 'user', t.id, `${t.name} (${t.role})`);
  notify(t.id, approve ? 'Registration approved' : 'Registration declined', approve ? 'Welcome! You can now use the platform.' : req.body?.reason || '');
  res.json({ ok: true });
});

// ---------- Faculties, departments, programmes ----------
r.get('/structure', (req, res) => {
  res.json({
    faculties: q.all(`SELECT f.*, u.name AS dean_name, (SELECT COUNT(*) FROM departments d WHERE d.faculty_id = f.id AND d.archived_at IS NULL) AS dept_count
      FROM faculties f LEFT JOIN users u ON u.id = f.dean_id ORDER BY f.name`),
    departments: q.all(`SELECT d.*, u.name AS hod_name, f.name AS faculty_name,
      (SELECT COUNT(*) FROM users s WHERE s.department_id = d.id AND s.role='student' AND s.status='active') AS students,
      (SELECT COUNT(*) FROM users s WHERE s.department_id = d.id AND s.role IN ('lecturer','hod','dean') AND s.status='active') AS staff
      FROM departments d JOIN faculties f ON f.id = d.faculty_id LEFT JOIN users u ON u.id = d.hod_id ORDER BY f.name, d.name`),
    programs: q.all('SELECT p.*, d.name AS department_name FROM programs p JOIN departments d ON d.id = p.department_id ORDER BY d.name, p.name'),
  });
});

const crud = (table, fields, check) => {
  r.post(`/${table}`, requireRole(...ADMIN), (req, res) => {
    const b = req.body || {};
    const err = check?.(b); if (err) return res.status(400).json({ error: err });
    const id = q.run(`INSERT INTO ${table}(${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, ...fields.map((f) => b[f] ?? null)).id;
    log(req.user.id, `Created ${table.slice(0, -1).replace('facultie', 'faculty')}`, table, id, b.name);
    res.status(201).json({ id });
  });
  r.put(`/${table}/:id`, requireRole(...ADMIN), (req, res) => {
    const b = req.body || {};
    const row = q.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    q.run(`UPDATE ${table} SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...fields.map((f) => (b[f] !== undefined ? b[f] || null : row[f])), row.id);
    log(req.user.id, `Updated ${table.slice(0, -1).replace('facultie', 'faculty')}`, table, row.id, b.name || row.name);
    res.json({ ok: true });
  });
  const label = table === 'faculties' ? 'faculty' : table.slice(0, -1);
  // Units are deactivated, never deleted: deleting would cascade to departments/programmes and null out members' units.
  r.post(`/${table}/:id/deactivate`, requireRole(...ADMIN), (req, res) => {
    const row = q.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const blocker = DEACTIVATE_GUARDS[table](row);
    if (blocker) return res.status(409).json({ error: `Cannot deactivate ${row.name}: ${blocker}` });
    if (!archiveRow(table, row.id, req.user.id)) return res.status(400).json({ error: 'Already inactive' });
    log(req.user.id, `Deactivated ${label}`, table, row.id, row.name);
    res.json({ ok: true });
  });
  r.post(`/${table}/:id/restore`, requireRole(...ADMIN), (req, res) => {
    const row = q.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const parent = table === 'departments' ? q.get('SELECT name, archived_at FROM faculties WHERE id = ?', row.faculty_id)
      : table === 'programs' ? q.get('SELECT name, archived_at FROM departments WHERE id = ?', row.department_id) : null;
    if (parent?.archived_at) return res.status(409).json({ error: `Reactivate ${parent.name} first` });
    if (!restoreRow(table, row.id)) return res.status(400).json({ error: 'Already active' });
    log(req.user.id, `Reactivated ${label}`, table, row.id, row.name);
    res.json({ ok: true });
  });
};

const n = (sql, ...a) => q.get(sql, ...a).n;
const DEACTIVATE_GUARDS = {
  faculties: (f) => {
    const d = n('SELECT COUNT(*) AS n FROM departments WHERE faculty_id = ? AND archived_at IS NULL', f.id);
    return d ? `it still has ${d} active department(s). Deactivate or move them first.` : null;
  },
  departments: (d) => {
    const p = n('SELECT COUNT(*) AS n FROM programs WHERE department_id = ? AND archived_at IS NULL', d.id);
    const u = n("SELECT COUNT(*) AS n FROM users WHERE department_id = ? AND status IN ('active','pending')", d.id);
    if (p) return `it still has ${p} active programme(s).`;
    return u ? `${u} active or pending member(s) still belong to it. Move or deactivate them first.` : null;
  },
  programs: (p) => {
    const s = n("SELECT COUNT(*) AS n FROM users WHERE program_id = ? AND status IN ('active','pending')", p.id);
    return s ? `${s} active or pending student(s) are enrolled in it.` : null;
  },
};
const activeParent = (table, id, what) => {
  const row = id ? q.get(`SELECT archived_at FROM ${table} WHERE id = ?`, id) : null;
  return !row ? `Select a valid ${what}` : row.archived_at ? `The selected ${what} is inactive` : null;
};
crud('faculties', ['name', 'code'], (b) => (!b.name ? 'Faculty name is required' : null));
crud('departments', ['faculty_id', 'name', 'code'], (b) => (!b.name ? 'Department name is required' : activeParent('faculties', b.faculty_id, 'faculty')));
crud('programs', ['department_id', 'name', 'degree', 'level', 'duration'], (b) => (!b.name ? 'Programme name is required' : activeParent('departments', b.department_id, 'department')));

// Assign dean / HOD (promotes the selected staff member's role)
r.post('/faculties/:id/dean', requireRole(...ADMIN), (req, res) => assignHead(req, res, 'faculties', 'dean'));
r.post('/departments/:id/hod', requireRole(...ADMIN), (req, res) => assignHead(req, res, 'departments', 'hod'));
function assignHead(req, res, table, role) {
  const unit = q.get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
  const u = q.get('SELECT * FROM users WHERE id = ?', req.body?.user_id);
  if (!unit || !u) return res.status(404).json({ error: 'Not found' });
  if (unit.archived_at) return res.status(409).json({ error: `${unit.name} is inactive` });
  if (u.status !== 'active') return res.status(409).json({ error: `${u.name}'s account is not active` });
  if (!['lecturer', 'hod', 'dean'].includes(u.role)) return res.status(400).json({ error: 'Only academic staff can be appointed' });
  const col = role === 'dean' ? 'dean_id' : 'hod_id';
  if (unit[col] && unit[col] !== u.id) q.run("UPDATE users SET role = 'lecturer' WHERE id = ? AND role = ?", unit[col], role);
  if (role === 'dean') q.run("UPDATE users SET role = 'dean', faculty_id = ? WHERE id = ?", unit.id, u.id);
  else q.run("UPDATE users SET role = 'hod', department_id = ?, faculty_id = ? WHERE id = ?", unit.id, unit.faculty_id, u.id);
  syncHeadship(u.id);
  log(req.user.id, `Appointed ${role === 'dean' ? 'Dean' : 'HOD'}`, table, unit.id, `${u.name} → ${unit.name}`);
  notify(u.id, `Appointed ${role === 'dean' ? 'Dean' : 'Head of Department'}`, `You are now ${role === 'dean' ? 'Dean' : 'HOD'} of ${unit.name}.`, '/');
  res.json({ ok: true });
}

// ---------- Settings & feature flags ----------
r.get('/settings', requireRole(...ADMIN), (req, res) => res.json(getSettings()));
r.put('/settings', requireRole(...ADMIN), (req, res) => {
  const allowed = ['features', 'session', 'institution', 'plagiarism_threshold', 'ai_threshold'];
  for (const k of allowed) if (req.body?.[k] !== undefined) setSetting(k, req.body[k]);
  log(req.user.id, 'Updated system settings', 'settings', null, Object.keys(req.body || {}).join(', '));
  res.json(getSettings());
});

// ---------- Activity log ----------
r.get('/activity', requireRole(...ADMIN), (req, res) => {
  const { search, user_id, limit = 200 } = req.query;
  const where = ['1=1'], params = [];
  if (search) { where.push('(a.action LIKE ? OR a.details LIKE ? OR u.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (user_id) { where.push('a.user_id = ?'); params.push(user_id); }
  res.json(q.all(`SELECT a.*, u.name AS user_name, u.role AS user_role FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`, ...params, Math.min(+limit || 200, 2000)));
});

// ---------- Aggregate statistics ----------
r.get('/stats', requireRole('superadmin', 'sysadmin', 'dean', 'hod'), (req, res) => {
  const [w, p] = scope(req.user, 'su');
  const pj = `FROM projects pr JOIN users su ON su.id = pr.student_id WHERE ${w}`;
  const count = (sql, ...a) => q.get(sql, ...a).n;
  const out = {
    users: q.all(`SELECT su.role, su.status, COUNT(*) AS n FROM users su WHERE ${w} GROUP BY su.role, su.status`, ...p),
    projectsByStage: q.all(`SELECT pr.level, pr.stage, COUNT(*) AS n ${pj} GROUP BY pr.level, pr.stage`, ...p),
    projectsByDept: q.all(`SELECT d.name, COUNT(*) AS n, SUM(pr.stage = 'completed') AS completed, SUM(pr.supervisor_id IS NULL) AS unallocated
      ${pj.replace('WHERE', 'JOIN departments d ON d.id = su.department_id WHERE')} GROUP BY d.id ORDER BY n DESC`, ...p),
    totals: {
      projects: count(`SELECT COUNT(*) AS n ${pj}`, ...p),
      unallocated: count(`SELECT COUNT(*) AS n ${pj} AND pr.supervisor_id IS NULL`, ...p),
      pendingReviews: count(`SELECT COUNT(*) AS n FROM submissions s JOIN projects pr ON pr.id = s.project_id JOIN users su ON su.id = pr.student_id WHERE s.status = 'submitted' AND ${w}`, ...p),
      pendingTopics: count(`SELECT COUNT(*) AS n FROM topics t JOIN projects pr ON pr.id = t.project_id JOIN users su ON su.id = pr.student_id WHERE t.status = 'pending' AND ${w}`, ...p),
      pendingApprovals: count(`SELECT COUNT(*) AS n FROM users su WHERE su.status = 'pending' AND ${w}`, ...p),
      submissions: count(`SELECT COUNT(*) AS n FROM submissions s JOIN projects pr ON pr.id = s.project_id JOIN users su ON su.id = pr.student_id WHERE ${w}`, ...p),
      completed: count(`SELECT COUNT(*) AS n ${pj} AND pr.stage = 'completed'`, ...p),
      faculties: count('SELECT COUNT(*) AS n FROM faculties WHERE archived_at IS NULL'),
      departments: count('SELECT COUNT(*) AS n FROM departments WHERE archived_at IS NULL'),
      programs: count('SELECT COUNT(*) AS n FROM programs WHERE archived_at IS NULL'),
      manuscripts: count('SELECT COUNT(*) AS n FROM manuscripts WHERE archived_at IS NULL'),
      posts: count('SELECT COUNT(*) AS n FROM posts WHERE archived_at IS NULL'),
      messages: count('SELECT COUNT(*) AS n FROM messages'),
    },
    activityByDay: ADMIN.includes(req.user.role) ? q.all(`SELECT date(created_at) AS day, COUNT(*) AS n FROM activity_log
      WHERE created_at >= date('now','-13 days') GROUP BY day ORDER BY day`) : [],
    recentActivity: ADMIN.includes(req.user.role) ? q.all(`SELECT a.*, u.name AS user_name, u.role AS user_role FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 15`) : [],
  };
  res.json(out);
});

export default r;
