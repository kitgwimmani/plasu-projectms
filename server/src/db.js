import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'plasu_pms.sqlite');
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

const clean = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

/** Small helpers around node:sqlite prepared statements. */
export const q = {
  all: (sql, ...p) => db.prepare(sql).all(...clean(p)),
  get: (sql, ...p) => db.prepare(sql).get(...clean(p)),
  run: (sql, ...p) => {
    const r = db.prepare(sql).run(...clean(p));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  },
  tx: (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS faculties (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT, dean_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY, faculty_id INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    name TEXT NOT NULL, code TEXT, hod_id INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY, department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL, degree TEXT, level TEXT NOT NULL DEFAULT 'UG', duration TEXT,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    phone TEXT, title TEXT, faculty_id INTEGER REFERENCES faculties(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
    matric_no TEXT, staff_id TEXT, level TEXT, research_interests TEXT, bio TEXT,
    rejection_reason TEXT, approved_by INTEGER, last_login TEXT,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    co_supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT, abstract TEXT, level TEXT NOT NULL DEFAULT 'UG', stage TEXT NOT NULL DEFAULT 'registered',
    substatus TEXT DEFAULT 'Awaiting supervisor allocation', session TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'pending',
    refined_title TEXT, feedback TEXT, reviewed_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, title TEXT, content_html TEXT, file_path TEXT, file_name TEXT,
    note TEXT, status TEXT NOT NULL DEFAULT 'submitted', feedback TEXT, version INTEGER DEFAULT 1,
    plagiarism_score REAL, ai_score REAL, reviewed_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS progress_events (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT, label TEXT NOT NULL, note TEXT, actor_id INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS defenses (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL, scheduled_at TEXT, venue TEXT, panel TEXT, status TEXT DEFAULT 'scheduled',
    remarks TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, content_html TEXT DEFAULT '', kind TEXT DEFAULT 'chapter',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, body TEXT, link TEXT, is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
    file_path TEXT, file_name TEXT, url TEXT, faculty_id INTEGER, level TEXT DEFAULT 'ALL',
    downloads INTEGER DEFAULT 0, uploaded_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS ref_items (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'journal', authors TEXT, year TEXT, title TEXT, source TEXT, volume TEXT,
    issue TEXT, pages TEXT, publisher TEXT, place TEXT, url TEXT, doi TEXT, accessed TEXT,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT DEFAULT 'General', title TEXT NOT NULL, body TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS post_comments (
    id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS manuscripts (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, abstract TEXT, keywords TEXT, target_journal TEXT, status TEXT DEFAULT 'drafting',
    content_html TEXT DEFAULT '', file_path TEXT, file_name TEXT, doi TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS manuscript_members (
    manuscript_id INTEGER NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'co-author',
    PRIMARY KEY (manuscript_id, user_id));
  CREATE TABLE IF NOT EXISTS manuscript_comments (
    id INTEGER PRIMARY KEY, manuscript_id INTEGER NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT, audience TEXT DEFAULT 'all',
    faculty_id INTEGER, department_id INTEGER, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
    details TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(sender_id, receiver_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_sub_project ON submissions(project_id);
  CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);
  CREATE TABLE IF NOT EXISTS submission_comments (
    id INTEGER PRIMARY KEY, submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id), parent_id INTEGER REFERENCES submission_comments(id),
    cid TEXT, color TEXT, category TEXT, quote TEXT, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
  CREATE INDEX IF NOT EXISTS idx_subcomments ON submission_comments(submission_id);
  `);

  // Soft-delete support: records are deactivated/archived (archived_at set) instead of being deleted,
  // so related projects, submissions, messages and audit history are never orphaned or cascaded away.
  const addCol = (table, col, def) => {
    if (!q.all(`PRAGMA table_info(${table})`).some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  for (const t of ARCHIVABLE) { addCol(t, 'archived_at', 'TEXT'); addCol(t, 'archived_by', 'INTEGER'); }
  // Supervisor's annotated/edited copy of a submission (the student's original content_html is never modified).
  addCol('submissions', 'reviewed_html', 'TEXT');
  addCol('submissions', 'annotated_by', 'INTEGER');
  addCol('submissions', 'annotated_at', 'TEXT');
}

export const ARCHIVABLE = ['users', 'faculties', 'departments', 'programs', 'documents', 'ref_items', 'resources', 'manuscripts', 'announcements', 'posts'];

/** Marks a row archived/deactivated. Returns false if it was already archived. */
export function archiveRow(table, id, actorId) {
  if (!ARCHIVABLE.includes(table)) throw new Error(`${table} is not archivable`);
  return q.run(`UPDATE ${table} SET archived_at = datetime('now'), archived_by = ? WHERE id = ? AND archived_at IS NULL`, actorId, id).changes > 0;
}
export function restoreRow(table, id) {
  if (!ARCHIVABLE.includes(table)) throw new Error(`${table} is not archivable`);
  return q.run(`UPDATE ${table} SET archived_at = NULL, archived_by = NULL WHERE id = ? AND archived_at IS NOT NULL`, id).changes > 0;
}

export function getSettings() {
  const out = {};
  for (const r of q.all('SELECT key, value FROM settings')) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}
export function setSetting(key, value) {
  q.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
