import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { BarList, Empty, Loading, PageHead, Pagination, Stat, TableControls, Tabs, fmtDate, useFetch, useTableControls } from '../components/ui.jsx';

const REPORTS = [
  { key: 'progress', label: 'Project progress report' },
  { key: 'workload', label: 'Supervisor workload' },
  { key: 'risk', label: 'At-risk students' },
  { key: 'stages', label: 'Stage distribution' },
];
const idleBand = (d) => (d == null ? 'No activity' : d >= 60 ? '60+ days' : d >= 30 ? '30–59 days' : d >= 14 ? '14–29 days' : 'Under 14 days');
const isRisk = (r) => r.stage !== 'completed' && (r.idle_days >= 30 || r.substatus === 'Make corrections' || !r.supervisor_id);
const concerns = (r) => [!r.supervisor_id && 'No supervisor', r.substatus === 'Make corrections' && 'Pending corrections', r.idle_days >= 30 && `Idle ${r.idle_days} days`].filter(Boolean);

export default function Reports() {
  const { user, settings } = useAuth();
  const [type, setType] = useState('progress');
  const { data, loading } = useFetch('/projects/reports/progress');
  const isAdm = ['superadmin', 'sysadmin'].includes(user.role);
  const t = useTableControls(data?.rows, {
    placeholder: 'Search student, matric no., title, supervisor…',
    search: ['student_name', 'matric_no', 'title', 'supervisor_name', 'department_name', 'program_name'],
    filters: [
      ...(isAdm ? [{ key: 'faculty', label: 'Faculty', get: (r) => r.faculty_name }] : []),
      ...(user.role !== 'hod' ? [{ key: 'dept', label: 'Department', get: (r) => r.department_name }] : []),
      { key: 'program', label: 'Programme', get: (r) => r.program_name },
      { key: 'level', label: 'Level', get: (r) => r.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
      { key: 'supervisor', label: 'Supervisor', get: (r) => r.supervisor_name, noneLabel: '— Unallocated —' },
      { key: 'stage', label: 'Stage', get: (r) => r.stage_label },
      { key: 'status', label: 'Status', get: (r) => r.substatus },
      { key: 'idle', label: 'Idle', get: (r) => idleBand(r.idle_days) },
      { key: 'concern', label: 'Concern', get: (r) => (isRisk(r) ? concerns(r).map((c) => c.replace(/\d+ days/, '30+ days')) : 'None') },
    ],
  });
  if (loading || !data) return <Loading />;

  const rows = t.allRows; // reports aggregate, export and print every matching row; tables paginate on screen only
  const risk = rows.filter(isRisk);
  const stageCount = {};
  rows.forEach((r) => { stageCount[r.stage_label] = (stageCount[r.stage_label] || 0) + 1; });
  const bySup = {};
  rows.forEach((x) => {
    const k = x.supervisor_name || '— Unallocated —';
    bySup[k] ||= { supervisor: k, students: 0, sum: 0, completed: 0, pending: 0 };
    Object.assign(bySup[k], { students: bySup[k].students + 1, sum: bySup[k].sum + x.progress, completed: bySup[k].completed + (x.stage === 'completed' ? 1 : 0), pending: bySup[k].pending + x.pending_submissions + x.pending_topics });
  });
  const workload = Object.values(bySup).sort((a, b) => b.students - a.students);
  const summary = {
    total: rows.length, completed: rows.filter((r) => r.stage === 'completed').length, unallocated: rows.filter((r) => !r.supervisor_id).length,
    corrections: rows.filter((r) => r.substatus === 'Make corrections').length, idle30: rows.filter((r) => r.idle_days >= 30).length,
    avg: rows.length ? Math.round(rows.reduce((a, r) => a + r.progress, 0) / rows.length) : 0,
  };
  const scope = user.role === 'hod' ? user.department_name : user.role === 'dean' ? user.faculty_name : user.role === 'lecturer' ? 'My supervisees' : 'All faculties';
  const activeFilters = t.filters.filter((f) => t.values[f.key]).map((f) => `${f.label}: ${t.options[f.key]?.find((o) => o.value === t.values[f.key])?.label || t.values[f.key]}`);
  if (t.query) activeFilters.push(`Search: "${t.query}"`);

  const csv = () => {
    const head = ['Student', 'Matric', 'Level', 'Department', 'Programme', 'Title', 'Supervisor', 'Stage', 'Status', 'Progress %', 'Idle days'];
    const src = type === 'risk' ? risk : rows;
    const body = type === 'workload'
      ? [['Supervisor', 'Students', 'Avg progress %', 'Completed', 'Awaiting review'], ...workload.map((s) => [s.supervisor, s.students, Math.round(s.sum / s.students), s.completed, s.pending])]
      : [head, ...src.map((r) => [r.student_name, r.matric_no, r.level, r.department_name, r.program_name, r.title || '', r.supervisor_name || '', r.stage_label, r.substatus, r.progress, r.idle_days ?? ''])];
    const text = body.map((x) => x.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `plasu-${type}-report.csv`; a.click();
  };

  return (
    <div>
      <PageHead title="Reports" sub="Generate, print or export project reports. Search and filters apply to every report type.">
        <button className="btn ghost" onClick={csv} disabled={!rows.length}>Export CSV</button>
        <button className="btn" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      </PageHead>
      <div className="no-print"><Tabs tabs={REPORTS} value={type} onChange={setType} /></div>
      <TableControls {...t} />
      <div className="report-sheet">
        <div className="report-letterhead">
          <img src="/logo.png" alt="" />
          <div>
            <h2>{settings.institution?.name || 'Plateau State University, Bokkos'}</h2>
            <h3>{REPORTS.find((r) => r.key === type).label}</h3>
            <p>{scope} · Session {data.session} · Generated {fmtDate(data.generated_at, true)}</p>
            {activeFilters.length > 0 && <p>Filtered by {activeFilters.join(' · ')}</p>}
          </div>
        </div>
        <div className="stats">
          <Stat label="Students" value={summary.total} />
          <Stat label="Average progress" value={`${summary.avg}%`} />
          <Stat label="Completed" value={summary.completed} />
          <Stat label="Unallocated" value={summary.unallocated} />
          <Stat label="Making corrections" value={summary.corrections} />
          <Stat label="Idle ≥ 30 days" value={summary.idle30} />
        </div>
        {!rows.length ? <Empty>{t.total ? 'No projects match your search or filters.' : 'No projects in this scope.'}</Empty> : (<>
          {type === 'progress' && <ProgressTable rows={rows} />}
          {type === 'risk' && (risk.length ? <ProgressTable rows={risk} showReason /> : <Empty>No at-risk students 🎉</Empty>)}
          {type === 'workload' && (
            <div className="table-wrap"><table className="table"><thead><tr><th>Supervisor</th><th>Students</th><th>Avg. progress</th><th>Completed</th><th>Items awaiting review</th></tr></thead>
              <tbody>{workload.map((s) => <tr key={s.supervisor}><td>{s.supervisor}</td><td>{s.students}</td><td>{Math.round(s.sum / s.students)}%</td><td>{s.completed}</td><td>{s.pending}</td></tr>)}</tbody></table></div>
          )}
          {type === 'stages' && <div className="card"><BarList items={Object.entries(stageCount).map(([label, value]) => ({ label, value }))} /></div>}
        </>)}
        <div className="signature-block print-only">
          <div><span /><small>Prepared by: {user.title} {user.name}</small></div>
          <div><span /><small>Signature & Date</small></div>
        </div>
      </div>
    </div>
  );
}

/** Paginated on screen; rows on other pages are hidden with .off-page, which print CSS shows, so printouts are complete. */
function ProgressTable({ rows, showReason }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size;
  return (
    <>
    <div className="table-wrap"><table className="table compact report-table">
      <thead><tr><th>#</th><th>Student</th><th>Matric no.</th><th>Lvl</th><th>Project title</th><th>Supervisor</th><th>Stage</th><th>%</th><th>{showReason ? 'Concern' : 'Status'}</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id} className={i < start || i >= start + size ? 'off-page' : ''}><td>{i + 1}</td><td>{r.student_name}</td><td><small>{r.matric_no}</small></td><td>{r.level}</td><td><small>{r.title || '—'}</small></td><td><small>{r.supervisor_name || '—'}</small></td><td><small>{r.stage_label}</small></td><td>{r.progress}</td>
          <td><small>{showReason ? concerns(r).join('; ') : r.substatus}</small></td></tr>
      ))}</tbody>
    </table></div>
    <Pagination page={cur} pages={pages} setPage={(p) => setPage(Math.max(1, Math.min(pages, p)))} pageSize={size}
      setPageSize={(n) => { setSize(n); setPage(1); }} start={start} count={rows.length} />
    </>
  );
}
