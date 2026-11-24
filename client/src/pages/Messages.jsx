import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Empty, Loading, Modal, timeAgo, toastErr, useFetch, fmtDate } from '../components/ui.jsx';

export default function Messages() {
  const { uid } = useParams();
  const { user, feature } = useAuth();
  const nav = useNavigate();
  const { data: convos, reload } = useFetch('/messages/conversations');
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    if (!uid) { setThread(null); return; }
    let alive = true;
    const load = () => api.get(`/messages/with/${uid}`).then((d) => { if (alive) { setThread(d); window.dispatchEvent(new Event('counts:refresh')); } }).catch(toastErr);
    load();
    const t = setInterval(() => { load(); reload(); }, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [uid, reload]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const m = await api.post(`/messages/with/${uid}`, { body: text });
      setThread((t) => ({ ...t, messages: [...t.messages, m] })); setText(''); reload();
    } catch (err) { toastErr(err); }
  };
  if (!feature('chat')) return <Empty>Messaging is currently disabled.</Empty>;

  return (
    <div className={`chat ${uid ? 'has-thread' : ''}`}>
      <aside className="chat-list">
        <div className="row between"><h3>Messages</h3><button className="btn sm" onClick={() => setPicker(true)}>+ New</button></div>
        {!convos ? <Loading /> : !convos.length ? <p className="muted small">No conversations yet. Start one with your supervisor, students or colleagues.</p> : convos.map((c) => (
          <Link key={c.id} to={`/messages/${c.id}`} className={`convo ${String(c.id) === uid ? 'active' : ''}`}>
            <span className="avatar sm">{c.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
            <span className="convo-body"><strong>{c.title} {c.name}</strong><small className="muted clamp1">{c.last_sender === user.id ? 'You: ' : ''}{c.last_body}</small></span>
            <span className="convo-meta"><small className="muted">{timeAgo(c.last_at)}</small>{c.unread > 0 && <span className="nav-badge">{c.unread}</span>}</span>
          </Link>
        ))}
      </aside>
      <section className="chat-thread">
        {!uid ? <Empty>Select a conversation or start a new one.</Empty> : !thread ? <Loading /> : (<>
          <header className="chat-head">
            <button className="icon-btn back-btn" onClick={() => nav('/messages')} aria-label="Back to conversations">←</button>
            <div><strong>{thread.user.title} {thread.user.name}</strong><small className="muted"> · {ROLE_LABEL[thread.user.role]}</small></div>
          </header>
          <div className="chat-msgs">
            {!thread.messages.length && <p className="muted center">Say hello 👋</p>}
            {thread.messages.map((m, i) => {
              const prev = thread.messages[i - 1];
              const day = fmtDate(m.created_at);
              return (
                <div key={m.id}>
                  {(!prev || fmtDate(prev.created_at) !== day) && <div className="day-sep">{day}</div>}
                  <div className={`bubble ${m.sender_id === user.id ? 'mine' : ''}`}><p className="prewrap">{m.body}</p><small>{fmtDate(m.created_at, true).split(', ').pop()}{m.sender_id === user.id ? (m.is_read ? ' · Read' : ' · Sent') : ''}</small></div>
                </div>
              );
            })}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={send}>
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} aria-label="Message" />
            <button className="btn" disabled={!text.trim()}>Send</button>
          </form>
        </>)}
      </section>
      {picker && <ContactPicker onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); nav(`/messages/${id}`); }} />}
    </div>
  );
}

function ContactPicker({ onClose, onPick }) {
  const [s, setS] = useState('');
  const { data } = useFetch(`/messages/contacts?search=${encodeURIComponent(s)}`);
  return (
    <Modal title="New message" onClose={onClose}>
      <input className="search block" autoFocus placeholder="Search people by name, email or department…" value={s} onChange={(e) => setS(e.target.value)} />
      <div className="picker">{!data ? <Loading /> : data.map((u) => (
        <button key={u.id} className="picker-item" onClick={() => onPick(u.id)}>
          <strong>{u.title} {u.name}</strong><small className="muted">{ROLE_LABEL[u.role]}{u.department_name ? ` · ${u.department_name}` : ''}{u.linked ? ' · your supervision' : ''}</small>
        </button>
      ))}</div>
    </Modal>
  );
}
