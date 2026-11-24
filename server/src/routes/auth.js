import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, getSettings } from '../db.js';
import { authenticate, signToken, publicUser } from '../lib/auth.js';
import { log, notify, notifyMany, feature } from '../lib/util.js';

const r = Router();

export const userDetail = (id) => publicUser(q.get(`
  SELECT u.*, f.name AS faculty_name, d.name AS department_name, p.name AS program_name, p.degree AS program_degree
  FROM users u LEFT JOIN faculties f ON f.id = u.faculty_id LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN programs p ON p.id = u.program_id WHERE u.id = ?`, id));

// Public catalogue used by the registration form
r.get('/catalog', (req, res) => {
  res.json({
    faculties: q.all('SELECT id, name, code FROM faculties WHERE archived_at IS NULL ORDER BY name'),
    departments: q.all('SELECT id, faculty_id, name, code FROM departments WHERE archived_at IS NULL ORDER BY name'),
    programs: q.all('SELECT id, department_id, name, degree, level FROM programs WHERE archived_at IS NULL ORDER BY name'),
    institution: getSettings().institution,
    registrationOpen: feature('registration'),
  });
});

r.post('/register', (req, res) => {
  if (!feature('registration')) return res.status(403).json({ error: 'Self-registration is currently closed' });
  const b = req.body || {};
  const role = b.role === 'lecturer' ? 'lecturer' : 'student';
  if (!b.name?.trim() || !b.email?.trim() || !b.password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(b.password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!/^\S+@\S+\.\S+$/.test(b.email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const dept = q.get('SELECT * FROM departments WHERE id = ? AND archived_at IS NULL', b.department_id);
  if (!dept) return res.status(400).json({ error: 'Select your department' });
  let level = null, program = null;
  if (role === 'student') {
    program = q.get('SELECT * FROM programs WHERE id = ? AND department_id = ? AND archived_at IS NULL', b.program_id, dept.id);
    if (!program) return res.status(400).json({ error: 'Select your programme' });
    if (!b.matric_no?.trim()) return res.status(400).json({ error: 'Matriculation / registration number is required' });
    level = program.level;
  } else if (!b.staff_id?.trim()) return res.status(400).json({ error: 'Staff ID is required' });
  if (q.get('SELECT id FROM users WHERE email = ?', b.email.trim())) return res.status(409).json({ error: 'An account with this email already exists' });

  const id = q.run(`INSERT INTO users(name, email, password_hash, role, status, title, phone, faculty_id, department_id, program_id, matric_no, staff_id, level, research_interests)
    VALUES (?,?,?,?, 'pending', ?,?,?,?,?,?,?,?,?)`, b.name.trim(), b.email.trim(), bcrypt.hashSync(b.password, 10), role, b.title, b.phone,
    dept.faculty_id, dept.id, program?.id, b.matric_no?.trim(), b.staff_id?.trim(), level, b.research_interests).id;
  log(id, `New ${role} registration request`, 'user', id, `${b.name} → ${dept.name}`);
  const approvers = dept.hod_id ? [dept.hod_id] : q.all("SELECT id FROM users WHERE role IN ('superadmin','sysadmin') AND status='active'").map((x) => x.id);
  notifyMany(approvers, 'New registration request', `${b.name} (${role}) requested to join ${dept.name}`, '/approvals');
  res.status(201).json({ message: 'Registration submitted. Your Head of Department will review and approve your account.' });
});

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = q.get('SELECT * FROM users WHERE email = ?', String(email || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  if (u.status === 'pending') return res.status(403).json({ error: 'Your registration is awaiting approval by your Head of Department.' });
  if (u.status === 'rejected') return res.status(403).json({ error: `Your registration was not approved. ${u.rejection_reason || ''}`.trim() });
  if (u.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated. Contact the system administrator to reactivate it.' });
  if (u.status === 'suspended') return res.status(403).json({ error: 'Your account has been suspended. Contact the system administrator.' });
  q.run("UPDATE users SET last_login = datetime('now') WHERE id = ?", u.id);
  log(u.id, 'Signed in', 'user', u.id);
  res.json({ token: signToken(u), user: userDetail(u.id) });
});

r.get('/me', authenticate, (req, res) => res.json({ user: userDetail(req.user.id), settings: { features: getSettings().features, session: getSettings().session, institution: getSettings().institution } }));

r.put('/me', authenticate, (req, res) => {
  const b = req.body || {};
  q.run('UPDATE users SET name = COALESCE(?, name), phone = ?, title = ?, research_interests = ?, bio = ? WHERE id = ?',
    b.name?.trim() || null, b.phone, b.title, b.research_interests, b.bio, req.user.id);
  log(req.user.id, 'Updated profile', 'user', req.user.id);
  res.json({ user: userDetail(req.user.id) });
});

r.post('/me/password', authenticate, (req, res) => {
  const { current, next } = req.body || {};
  const u = q.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 10), req.user.id);
  log(req.user.id, 'Changed password', 'user', req.user.id);
  notify(req.user.id, 'Password changed', 'Your password was changed successfully.');
  res.json({ ok: true });
});

export default r;
