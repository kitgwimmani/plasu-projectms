import { q, getSettings } from '../db.js';

export const log = (userId, action, entity = null, entityId = null, details = null) =>
  q.run('INSERT INTO activity_log(user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    userId, action, entity, entityId, details ? String(details).slice(0, 500) : null);

export const notify = (userId, title, body = '', link = '') => {
  if (!userId) return;
  q.run('INSERT INTO notifications(user_id, title, body, link) VALUES (?,?,?,?)', userId, title, body, link);
};

export const notifyMany = (ids, title, body, link) => [...new Set(ids.filter(Boolean))].forEach((id) => notify(id, title, body, link));

export const stripHtml = (html = '') =>
  String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

/** Basic HTML sanitizer for editor content: drops scripts, event handlers and javascript: URLs. */
export const sanitizeHtml = (html = '') =>
  String(html).replace(/<(script|iframe|object|embed|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

export const feature = (name) => {
  const f = getSettings().features || {};
  return f[name] !== false;
};

export const requireFeature = (name) => (req, res, next) =>
  feature(name) ? next() : res.status(403).json({ error: `The "${name}" module is currently disabled by the system administrator` });

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
