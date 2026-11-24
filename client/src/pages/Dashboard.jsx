import { Link, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL, isAdminRole } from '../auth.jsx';
import { BarList, Badge, Columns, Empty, Loading, PageHead, Progress, Stat, timeAgo, useFetch, fmtDate } from '../components/ui.jsx';
import { Stepper } from './ProjectDetail.jsx';

const STAGE_NAMES = {
  registered: 'Registered', topic: 'Topic', proposal: 'Proposal', proposal_defense: 'Proposal defense', chapter1: 'Chapter 1', chapter2: 'Chapter 2',
  chapter3: 'Chapter 3', chapter4: 'Chapter 4', chapter5: 'Chapter 5', postfield: 'Post-field', final_draft: 'Final draft', defense: 'Defense', viva: 'Viva', completed: 'Completed',
};

function Announcements() {
  const { data } = useFetch('/announcements');
  return (
    <div className="card">
      <div className="card-head"><h3>Announcements</h3><Link to="/announcements">All</Link></div>
      {!data ? <Loading /> : !data.length ? <Empty>No announcements</Empty> : data.slice(0, 4).map((a) => (
        <div key={a.id} className="list-item"><strong>{a.title}</strong><p className="muted clamp2">{a.body}</p><small className="muted">{a.author} · {timeAgo(a.created_at)}</small></div>
      ))}
    </div>
  );
}

function StudentDash() {
  const { data: p, loading } = useFetch('/projects/mine');
  if (loading) return <Loading />;
  if (!p) return <Empty>No project record yet.</Empty>;
  const lastFeedback = p.submissions.find((s) => s.feedback) || p.topics.find((t) => t.feedback);
  return (
    <>
      <div className="stats">
        <Stat label="Progress" value={`${p.progress}%`} hint={p.stage_label} />
        <Stat label="Current status" value={<span className="stat-small">{p.substatus}</span>} />
        <Stat label="Submissions" value={p.submissions.length} hint={`${p.submissions.filter((s) => s.status === 'approved').length} approved`} />
        <Stat label="Supervisor" value={<span className="stat-small">{p.supervisor ? `${p.supervisor.title || ''} ${p.supervisor.name}` : 'Not yet allocated'}</span>} />
      </div>
      <div className="card">
        <div className="card-head"><h3>{p.title || 'Project title pending approval'}</h3><Link className="btn sm" to="/my-project">Open project</Link></div>
        <Stepper stages={p.stages} index={p.stage_index} substatus={p.substatus} />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Next steps</h3>
          <ul className="checklist">
            {!p.supervisor && <li>Wait for your HOD to allocate a supervisor. Meanwhile, download the <Link to="/resources">project template and guidelines</Link>.</li>}
            {p.supervisor && p.stage === 'topic' && <li><Link to="/my-project">Submit up to three project topics</Link> for your supervisor's approval.</li>}
            {p.substatus === 'Make corrections' && <li className="warn">Your supervisor requested corrections — <Link to="/my-project">view feedback</Link>.</li>}
            {p.stages[p.stage_index]?.doc && <li>Draft <b>{p.stage_label}</b> in the <Link to="/studio">Writing Studio</Link>, run the plagiarism & AI checks, then submit.</li>}
            <li>Keep your sources in the <Link to="/references">Reference Manager</Link>.</li>
          </ul>
          {lastFeedback && <div className="feedback"><small className="muted">Latest supervisor feedback</small><p>{lastFeedback.feedback}</p></div>}
        </div>
        <Announcements />
      </div>
    </>
  );
}

function StaffDash({ hideAnn }) {
  const { data: projects } = useFetch('/projects?mine=1');
  const { data: q } = useFetch('/projects/reviews/pending');
  const nav = useNavigate();
  if (!projects || !q) return <Loading />;
  const avg = projects.length ? Math.round(projects.reduce((a, p) => a + p.progress, 0) / projects.length) : 0;
  return (
    <>
      <div className="stats">
        <Stat label="Students supervised" value={projects.length} onClick={() => nav('/supervision')} />
        <Stat label="Topics to review" value={q.topics.length} onClick={() => nav('/reviews')} />
        <Stat label="Submissions to review" value={q.submissions.length} onClick={() => nav('/reviews')} />
        <Stat label="Average progress" value={`${avg}%`} />
      </div>
      <div className="grid2">
        <div className="card">
          <div className="card-head"><h3>My students</h3><Link to="/supervision">View all</Link></div>
          {!projects.length ? <Empty>No students allocated yet.</Empty> : (
            <table className="table compact"><tbody>
              {projects.slice(0, 8).map((p) => (
                <tr key={p.id} className="clickable" onClick={() => nav(`/projects/${p.id}`)}>
                  <td><strong>{p.student_name}</strong><br /><small className="muted">{p.level} · {p.stage_label}</small></td>
                  <td style={{ width: 140 }}><Progress value={p.progress} /></td>
                  <td>{p.pending_submissions + p.pending_topics > 0 && <Badge tone="warn">needs review</Badge>}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        {!hideAnn && <Announcements />}
      </div>
    </>
  );
}

function OversightDash({ user }) {
  const { data: s } = useFetch('/admin/stats');
  const nav = useNavigate();
  if (!s) return <Loading />;
  const t = s.totals;
  const byRole = {};
  s.users.forEach((u) => { if (u.status === 'active') byRole[u.role] = (byRole[u.role] || 0) + u.n; });
  const stageAgg = {};
  s.projectsByStage.forEach((x) => { stageAgg[x.stage] = (stageAgg[x.stage] || 0) + x.n; });
  const order = Object.keys(STAGE_NAMES);
  const admin = isAdminRole(user);
  return (
    <>
      <div className="stats">
        <Stat label="Active students" value={byRole.student || 0} hint={`${(byRole.lecturer || 0) + (byRole.hod || 0) + (byRole.dean || 0)} academic staff`} onClick={() => nav('/users')} />
        <Stat label="Projects" value={t.projects} hint={`${t.completed} completed`} onClick={() => nav('/projects')} />
        <Stat label="Awaiting supervisor" value={t.unallocated} onClick={() => nav('/projects?unallocated=1')} />
        <Stat label="Pending approvals" value={t.pendingApprovals} onClick={() => user.role !== 'dean' && nav('/approvals')} />
        <Stat label="Reviews pending" value={t.pendingReviews + t.pendingTopics} hint={`${t.pendingTopics} topics · ${t.pendingReviews} chapters`} />
        {admin && <Stat label="Academic units" value={t.departments} hint={`${t.faculties} faculties · ${t.programs} programmes`} onClick={() => nav('/structure')} />}
      </div>
      <div className="grid2">
        <div className="card"><h3>Projects by stage</h3>
          <BarList items={order.filter((k) => stageAgg[k]).map((k) => ({ label: STAGE_NAMES[k], value: stageAgg[k] }))} empty="No projects yet" />
        </div>
        <div className="card"><h3>Projects by department</h3>
          <BarList items={s.projectsByDept.slice(0, 10).map((d) => ({ label: d.name, value: d.n }))} empty="No projects yet" />
        </div>
      </div>
      {admin && (
        <div className="grid2">
          <div className="card"><h3>System activity — last 14 days</h3>
            <Columns items={lastDays(14).map((d) => ({ label: d, short: d.slice(8), value: s.activityByDay.find((x) => x.day === d)?.n || 0 }))} />
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent activity</h3><Link to="/activity">Full log</Link></div>
            <div className="feed">
              {s.recentActivity.map((a) => (
                <div key={a.id} className="feed-item"><span><strong>{a.user_name || 'System'}</strong> <span className="muted">({ROLE_LABEL[a.user_role] || '—'})</span> — {a.action}{a.details ? <span className="muted">: {a.details}</span> : null}</span><small className="muted">{timeAgo(a.created_at)}</small></div>
              ))}
            </div>
          </div>
        </div>
      )}
      {admin && (
        <div className="stats">
          <Stat label="Total submissions" value={t.submissions} />
          <Stat label="Messages exchanged" value={t.messages} />
          <Stat label="Community posts" value={t.posts} />
          <Stat label="Manuscripts" value={t.manuscripts} />
        </div>
      )}
      {!admin && <Announcements />}
    </>
  );
}

const lastDays = (n) => [...Array(n)].map((_, i) => { const d = new Date(Date.now() - (n - 1 - i) * 864e5); return d.toISOString().slice(0, 10); });

export default function Dashboard() {
  const { user } = useAuth();
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div>
      <PageHead title={`${greeting}, ${user.title ? user.title + ' ' : ''}${user.name.split(' ')[0]}`} sub={`${ROLE_LABEL[user.role]}${user.department_name ? ' · ' + user.department_name : user.faculty_name ? ' · ' + user.faculty_name : ''} · ${fmtDate(new Date().toISOString())}`} />
      {user.role === 'student' && <StudentDash />}
      {user.role === 'lecturer' && <StaffDash />}
      {['hod', 'dean', 'superadmin', 'sysadmin'].includes(user.role) && <OversightDash user={user} />}
      {['hod', 'dean'].includes(user.role) && <><h2 className="section-title">My supervision</h2><StaffDash hideAnn /></>}
    </div>
  );
}
