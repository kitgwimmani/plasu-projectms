import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { api } from '../api.js';
import { Toaster } from './ui.jsx';

const I = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  project: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  check: 'M20 6L9 17l-5-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  chart: 'M3 3v18h18M7 15v3M12 10v8M17 6v12',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cal: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  mega: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[name]} /></svg>
);

function navFor(u, feature) {
  const r = u.role;
  const staff = ['lecturer', 'hod', 'dean'].includes(r);
  const admin = ['superadmin', 'sysadmin'].includes(r);
  const sections = [];
  const main = [{ to: '/', label: 'Dashboard', icon: 'home', end: true }];
  if (r === 'student') main.push({ to: '/my-project', label: 'My Project', icon: 'project' });
  if (staff) main.push({ to: '/supervision', label: 'My Students', icon: 'users' }, { to: '/reviews', label: 'Review Queue', icon: 'check' });
  sections.push({ title: 'Overview', items: main });

  const mgmt = [];
  if (r === 'hod' || admin) mgmt.push({ to: '/approvals', label: 'Registration Approvals', icon: 'check' });
  if (r === 'hod' || r === 'dean' || admin) mgmt.push({ to: '/projects', label: r === 'hod' ? 'Department Projects' : r === 'dean' ? 'Faculty Projects' : 'All Projects', icon: 'list' });
  if ((r === 'hod' || r === 'dean' || admin) && feature('defenses')) mgmt.push({ to: '/defenses', label: 'Defenses & Seminars', icon: 'cal' });
  if (staff || admin) mgmt.push({ to: '/reports', label: 'Reports', icon: 'chart' });
  if (r === 'hod' || r === 'dean' || admin) mgmt.push({ to: '/users', label: admin ? 'Users & Admins' : 'People', icon: 'users' });
  if (admin) mgmt.push({ to: '/structure', label: 'Faculties & Departments', icon: 'building' }, { to: '/settings', label: 'Settings & Features', icon: 'gear' }, { to: '/activity', label: 'Activity Log', icon: 'list' });
  if (mgmt.length) sections.push({ title: 'Management', items: mgmt });

  const tools = [];
  if (feature('editor') && !admin) tools.push({ to: '/studio', label: 'Writing Studio', icon: 'edit' });
  if (feature('references') && !admin) tools.push({ to: '/references', label: 'References', icon: 'book' });
  if (feature('manuscripts') && !admin) tools.push({ to: '/manuscripts', label: 'Manuscripts', icon: 'pen' });
  if (feature('resources')) tools.push({ to: '/resources', label: 'Templates & Guides', icon: 'file' });
  if (tools.length) sections.push({ title: 'Research Tools', items: tools });

  const comm = [];
  if (feature('chat')) comm.push({ to: '/messages', label: 'Messages', icon: 'chat', badge: 'messages' });
  comm.push({ to: '/notifications', label: 'Notifications', icon: 'bell', badge: 'notifications' });
  if (feature('announcements')) comm.push({ to: '/announcements', label: 'Announcements', icon: 'mega' });
  if (feature('community')) comm.push({ to: '/community', label: 'Community', icon: 'globe' });
  sections.push({ title: 'Communication', items: comm });
  return sections;
}

export default function Layout() {
  const { user, logout, feature, settings } = useAuth();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    const tick = () => api.get('/summary').then((c) => alive && setCounts(c)).catch(() => {});
    tick();
    const t = setInterval(tick, 15000);
    window.addEventListener('counts:refresh', tick);
    return () => { alive = false; clearInterval(t); window.removeEventListener('counts:refresh', tick); };
  }, [loc.pathname]);
  useEffect(() => setOpen(false), [loc.pathname]);

  const sections = navFor(user, feature);
  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="PLASU logo" />
          <div><strong>PLASU PMS</strong><small>Project Management System</small></div>
        </Link>
        <nav>
          {sections.map((s) => (
            <div key={s.title} className="nav-section">
              <div className="nav-title">{s.title}</div>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="nav-item">
                  <Icon name={i.icon} /><span>{i.label}</span>
                  {i.badge && counts[i.badge] > 0 && <span className="nav-badge">{counts[i.badge]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">{settings.session && <>Session {settings.session}</>}</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">☰</button>
          <div className="topbar-title">{settings.institution?.name || 'Plateau State University, Bokkos'}</div>
          <div className="topbar-right">
            {feature('chat') && <Link to="/messages" className="icon-btn" aria-label="Messages"><Icon name="chat" />{counts.messages > 0 && <span className="dot">{counts.messages}</span>}</Link>}
            <Link to="/notifications" className="icon-btn" aria-label="Notifications"><Icon name="bell" />{counts.notifications > 0 && <span className="dot">{counts.notifications}</span>}</Link>
            <Link to="/profile" className="me">
              <span className="avatar">{user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
              <span className="me-text"><strong>{user.title ? `${user.title} ` : ''}{user.name}</strong><small>{ROLE_LABEL[user.role]}{user.department_name ? ` · ${user.department_name}` : user.faculty_name ? ` · ${user.faculty_name}` : ''}</small></span>
            </Link>
            <button className="btn ghost sm" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      <Toaster />
    </div>
  );
}
