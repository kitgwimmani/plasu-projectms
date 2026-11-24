import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Loading, PageHead, timeAgo, useFetch } from '../components/ui.jsx';

export default function Notifications() {
  const { data, loading, reload } = useFetch('/notifications');
  const nav = useNavigate();
  const open = async (n) => {
    if (!n.is_read) await api.post(`/notifications/${n.id}/read`);
    window.dispatchEvent(new Event('counts:refresh'));
    if (n.link) nav(n.link); else reload();
  };
  const readAll = async () => { await api.post('/notifications/read-all'); reload(); window.dispatchEvent(new Event('counts:refresh')); };
  return (
    <div>
      <PageHead title="Notifications"><button className="btn ghost" onClick={readAll}>Mark all as read</button></PageHead>
      <div className="card">
        {loading ? <Loading /> : !data?.length ? <Empty>You're all caught up.</Empty> : data.map((n) => (
          <button key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => open(n)}>
            <span className="notif-dot" aria-hidden="true" />
            <span><strong>{n.title}</strong>{n.body && <p className="muted">{n.body}</p>}</span>
            <small className="muted">{timeAgo(n.created_at)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
