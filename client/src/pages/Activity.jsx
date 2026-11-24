import { ROLE_LABEL } from '../auth.jsx';
import { Empty, Loading, PageHead, Pagination, TableControls, fmtDate, useFetch, useTableControls } from '../components/ui.jsx';

// Groups free-text actions ("Approved registration", "Deactivated account"…) into filterable categories.
const category = (a) => {
  const x = a.action.toLowerCase();
  if (/sign/.test(x)) return 'Sign-ins';
  if (/registration|account|password|profile/.test(x)) return 'Accounts & access';
  if (/topic|submi|supervisor|stage|defense/.test(x)) return 'Projects & supervision';
  if (/faculty|department|program|settings|appointed/.test(x)) return 'Structure & settings';
  if (/document|check|export|resource|manuscript/.test(x)) return 'Documents & tools';
  if (/announcement|post/.test(x)) return 'Communication';
  return 'Other';
};

export default function Activity() {
  const { data, loading } = useFetch('/admin/activity?limit=2000');
  const t = useTableControls(data, {
    placeholder: 'Search user, action, details…',
    search: ['user_name', 'action', 'details', 'entity', (a) => ROLE_LABEL[a.user_role]],
    filters: [
      { key: 'role', label: 'Role', get: (a) => a.user_role, format: (v) => ROLE_LABEL[v] || v, noneLabel: '— System —' },
      { key: 'user', label: 'User', get: (a) => a.user_name, noneLabel: '— System —' },
      { key: 'category', label: 'Category', get: category },
      { key: 'action', label: 'Action', get: (a) => a.action },
      { key: 'entity', label: 'Record type', get: (a) => a.entity },
      { key: 'date', label: 'Date', type: 'date', get: (a) => a.created_at },
    ],
  });
  const exportCsv = () => {
    const rows = [['Time', 'User', 'Role', 'Action', 'Details'], ...t.allRows.map((a) => [a.created_at, a.user_name || 'System', a.user_role || '', a.action, a.details || ''])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); el.download = 'plasu-activity-log.csv'; el.click();
  };
  return (
    <div>
      <PageHead title="Activity Log" sub="Every significant action on the platform, newest first (latest 2,000 entries)">
        <button className="btn ghost" onClick={exportCsv} disabled={!t.count}>Export filtered CSV</button>
      </PageHead>
      <div className="card">
        <TableControls {...t} />
        {loading ? <Loading /> : !t.rows.length ? <Empty>No activity matches.</Empty> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{t.rows.map((a) => (
              <tr key={a.id}><td className="nowrap"><small>{fmtDate(a.created_at, true)}</small></td><td>{a.user_name || 'System'}<br /><small className="muted">{ROLE_LABEL[a.user_role] || ''}</small></td><td>{a.action}</td><td><small className="muted">{a.details}</small></td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination {...t} />
      </div>
    </div>
  );
}
