import { Router } from 'express';
import { q, archiveRow, restoreRow } from '../db.js';
import { authenticate, isAdmin } from '../lib/auth.js';
import { log, notify, notifyMany, requireFeature } from '../lib/util.js';

const r = Router();
r.use(authenticate);

// ---------- Badge counters (polled by the client) ----------
r.get('/summary', (req, res) => {
  res.json({
    notifications: q.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).n,
    messages: q.get('SELECT COUNT(*) AS n FROM messages WHERE receiver_id = ? AND is_read = 0', req.user.id).n,
  });
});

// ---------- Notifications ----------
r.get('/notifications', (req, res) => res.json(q.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id)));
r.post('/notifications/read-all', (req, res) => { q.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id); res.json({ ok: true }); });
r.post('/notifications/:id/read', (req, res) => { q.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', req.params.id, req.user.id); res.json({ ok: true }); });

// ---------- Chat ----------
const chat = Router();
chat.use(requireFeature('chat'));
chat.get('/conversations', (req, res) => {
  const me = req.user.id;
  res.json(q.all(`
    SELECT u.id, u.name, u.title, u.role, m.body AS last_body, m.created_at AS last_at, m.sender_id AS last_sender,
      (SELECT COUNT(*) FROM messages x WHERE x.sender_id = u.id AND x.receiver_id = ? AND x.is_read = 0) AS unread
    FROM messages m JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
    WHERE m.id IN (SELECT MAX(id) FROM messages WHERE sender_id = ? OR receiver_id = ?
                   GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END)
    ORDER BY m.id DESC`, me, me, me, me, me));
});
chat.get('/contacts', (req, res) => {
  const s = `%${req.query.search || ''}%`;
  // Suggested contacts first: supervisor/students, then department colleagues.
  res.json(q.all(`SELECT u.id, u.name, u.title, u.role, d.name AS department_name,
      (EXISTS(SELECT 1 FROM projects p WHERE (p.student_id = u.id AND (p.supervisor_id = ? OR p.co_supervisor_id = ?))
         OR (p.student_id = ? AND (p.supervisor_id = u.id OR p.co_supervisor_id = u.id)))) AS linked
    FROM users u LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.status = 'active' AND u.id != ? AND (u.name LIKE ? OR u.email LIKE ? OR d.name LIKE ?)
    ORDER BY linked DESC, (u.department_id = ?) DESC, u.name LIMIT 60`, req.user.id, req.user.id, req.user.id, req.user.id, s, s, s, req.user.department_id));
});
chat.get('/with/:uid', (req, res) => {
  const other = q.get('SELECT id, name, title, role, email FROM users WHERE id = ?', req.params.uid);
  if (!other) return res.status(404).json({ error: 'User not found' });
  q.run('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0', other.id, req.user.id);
  res.json({
    user: other,
    messages: q.all(`SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY id DESC LIMIT 300`, req.user.id, other.id, other.id, req.user.id).reverse(),
  });
});
chat.post('/with/:uid', (req, res) => {
  const other = q.get("SELECT id FROM users WHERE id = ? AND status = 'active'", req.params.uid);
  const body = String(req.body?.body || '').trim();
  if (!other) return res.status(404).json({ error: 'User not found' });
  if (!body) return res.status(400).json({ error: 'Message is empty' });
  if (body.length > 5000) return res.status(400).json({ error: 'Message is too long' });
  const id = q.run('INSERT INTO messages(sender_id, receiver_id, body) VALUES (?,?,?)', req.user.id, other.id, body).id;
  res.status(201).json(q.get('SELECT * FROM messages WHERE id = ?', id));
});
r.use('/messages', chat);

// ---------- Announcements ----------
r.get('/announcements', (req, res) => {
  const u = req.user;
  const staff = ['lecturer', 'hod', 'dean'].includes(u.role);
  res.json(q.all(`SELECT a.*, u.name AS author, f.name AS faculty_name, d.name AS department_name FROM announcements a
    LEFT JOIN users u ON u.id = a.created_by LEFT JOIN faculties f ON f.id = a.faculty_id LEFT JOIN departments d ON d.id = a.department_id
    WHERE (a.archived_at IS NULL) = (? = 0) AND (? = 1 OR a.created_by = ? OR (
      (a.audience = 'all' OR (a.audience = 'students' AND ? = 'student') OR (a.audience = 'staff' AND ? = 1))
      AND (a.faculty_id IS NULL OR a.faculty_id = ?) AND (a.department_id IS NULL OR a.department_id = ?)))
    ORDER BY a.id DESC LIMIT 100`, req.query.archived ? 1 : 0, isAdmin(u) ? 1 : 0, u.id, u.role, staff ? 1 : 0, u.faculty_id, u.department_id));
});
r.post('/announcements', requireFeature('announcements'), (req, res) => {
  const u = req.user, b = req.body || {};
  if (!['superadmin', 'sysadmin', 'dean', 'hod'].includes(u.role)) return res.status(403).json({ error: 'Not allowed' });
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const faculty = u.role === 'dean' ? u.faculty_id : u.role === 'hod' ? null : b.faculty_id || null;
  const dept = u.role === 'hod' ? u.department_id : b.department_id || null;
  const id = q.run('INSERT INTO announcements(title, body, audience, faculty_id, department_id, created_by) VALUES (?,?,?,?,?,?)',
    b.title.trim(), b.body, ['all', 'students', 'staff'].includes(b.audience) ? b.audience : 'all', faculty, dept, u.id).id;
  const where = ["status = 'active'", 'id != ?'], params = [u.id];
  if (faculty) { where.push('faculty_id = ?'); params.push(faculty); }
  if (dept) { where.push('department_id = ?'); params.push(dept); }
  if (b.audience === 'students') where.push("role = 'student'");
  if (b.audience === 'staff') where.push("role IN ('lecturer','hod','dean')");
  notifyMany(q.all(`SELECT id FROM users WHERE ${where.join(' AND ')}`, ...params).map((x) => x.id), `📢 ${b.title.trim()}`, (b.body || '').slice(0, 140), '/announcements');
  log(u.id, 'Posted announcement', 'announcement', id, b.title);
  res.status(201).json({ id });
});
// Announcements are archived (hidden) rather than deleted, so the record of what was communicated is kept.
const archiveAnnouncement = (restore) => (req, res) => {
  const a = q.get('SELECT * FROM announcements WHERE id = ?', req.params.id);
  if (!a || !(isAdmin(req.user) || a.created_by === req.user.id)) return res.status(403).json({ error: 'Not allowed' });
  const changed = restore ? restoreRow('announcements', a.id) : archiveRow('announcements', a.id, req.user.id);
  if (!changed) return res.status(400).json({ error: restore ? 'Announcement is not archived' : 'Already archived' });
  log(req.user.id, restore ? 'Restored announcement' : 'Archived announcement', 'announcement', a.id, a.title);
  res.json({ ok: true });
};
r.post('/announcements/:id/archive', archiveAnnouncement(false));
r.post('/announcements/:id/restore', archiveAnnouncement(true));

// ---------- Community: forum & directory ----------
const com = Router();
com.use(requireFeature('community'));
com.get('/posts', (req, res) => {
  const { category, search } = req.query;
  const where = ['p.archived_at IS NULL'], params = [];
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (search) { where.push('(p.title LIKE ? OR p.body LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  res.json(q.all(`SELECT p.*, u.name AS author, u.title AS author_title, u.role AS author_role, d.name AS department_name,
    (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comments
    FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN departments d ON d.id = u.department_id
    WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 200`, ...params));
});
com.post('/posts', (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const id = q.run('INSERT INTO posts(user_id, category, title, body) VALUES (?,?,?,?)', req.user.id, b.category || 'General', b.title.trim(), b.body).id;
  log(req.user.id, 'Created community post', 'post', id, b.title);
  res.status(201).json({ id });
});
// Posts are archived (removed from the forum) rather than deleted, keeping replies and moderation history intact.
com.post('/posts/:id/archive', (req, res) => {
  const p = q.get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!p || !(p.user_id === req.user.id || isAdmin(req.user))) return res.status(403).json({ error: 'Not allowed' });
  if (!archiveRow('posts', p.id, req.user.id)) return res.status(400).json({ error: 'Already removed' });
  log(req.user.id, 'Archived community post', 'post', p.id, p.title);
  res.json({ ok: true });
});
com.get('/posts/:id/comments', (req, res) => res.json(q.all(`SELECT c.*, u.name AS author, u.role AS author_role FROM post_comments c
  JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id`, req.params.id)));
com.post('/posts/:id/comments', (req, res) => {
  const p = q.get('SELECT * FROM posts WHERE id = ? AND archived_at IS NULL', req.params.id);
  if (!p) return res.status(404).json({ error: 'Post not found' });
  if (!req.body?.body?.trim()) return res.status(400).json({ error: 'Comment is empty' });
  q.run('INSERT INTO post_comments(post_id, user_id, body) VALUES (?,?,?)', p.id, req.user.id, req.body.body.trim());
  if (p.user_id !== req.user.id) notify(p.user_id, 'New reply to your post', `${req.user.name}: ${req.body.body.slice(0, 100)}`, '/community');
  res.status(201).json({ ok: true });
});
com.get('/directory', (req, res) => {
  const s = `%${req.query.search || ''}%`;
  const where = ["u.status = 'active'", "u.role NOT IN ('superadmin','sysadmin')", '(u.name LIKE ? OR u.research_interests LIKE ? OR d.name LIKE ?)'];
  const params = [s, s, s];
  if (req.query.role === 'staff') where.push("u.role IN ('lecturer','hod','dean')");
  if (req.query.role === 'student') where.push("u.role = 'student'");
  res.json(q.all(`SELECT u.id, u.name, u.title, u.role, u.research_interests, u.bio, u.level, d.name AS department_name, f.name AS faculty_name,
    (SELECT COUNT(*) FROM manuscript_members mm WHERE mm.user_id = u.id) AS manuscripts
    FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN faculties f ON f.id = u.faculty_id
    WHERE ${where.join(' AND ')} ORDER BY (u.role = 'student'), u.name LIMIT 200`, ...params));
});
r.use('/community', com);

export default r;
