import jwt from 'jsonwebtoken';
import { q } from '../db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'plasu-pms-dev-secret-change-me';
export const ADMIN_ROLES = ['superadmin', 'sysadmin'];
export const ROLES = ['superadmin', 'sysadmin', 'dean', 'hod', 'lecturer', 'student'];

export const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

export const publicUser = (u) => {
  if (!u) return u;
  const { password_hash, ...rest } = u;
  return rest;
};

/** Accepts `Authorization: Bearer <t>` or `?token=<t>` (used for file downloads opened in a new tab). */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = q.get('SELECT * FROM users WHERE id = ?', payload.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if (user.status !== 'active') return res.status(403).json({ error: `Account is ${user.status}`, status: user.status });
    req.user = publicUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' });

export const isAdmin = (u) => ADMIN_ROLES.includes(u.role);
