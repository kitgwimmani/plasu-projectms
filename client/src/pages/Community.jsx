import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Empty, Field, Loading, Modal, PageHead, Tabs, timeAgo, toast, toastErr, useFetch } from '../components/ui.jsx';

const CATS = ['General', 'Collaboration', 'Research Opportunity', 'Q&A', 'Events', 'Funding & Grants', 'Datasets & Tools'];

export default function Community() {
  const [tab, setTab] = useState('forum');
  const { feature } = useAuth();
  if (!feature('community')) return <Empty>Community is currently disabled.</Empty>;
  return (
    <div>
      <PageHead title="Community & Networking" sub="Find collaborators, share opportunities and connect faculty with students" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'forum', label: 'Discussion forum' }, { key: 'directory', label: 'Researcher directory' }]} />
      {tab === 'forum' ? <Forum /> : <Directory />}
    </div>
  );
}

function Forum() {
  const { user } = useAuth();
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState('');
  const { data, loading, reload } = useFetch(`/community/posts?${new URLSearchParams({ ...(cat && { category: cat }), ...(search && { search }) })}`);
  const [creating, setCreating] = useState(false);
  const [openPost, setOpenPost] = useState(null);
  return (
    <>
      <div className="filters">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input className="search" placeholder="Search posts…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn" onClick={() => setCreating(true)}>+ New post</button>
      </div>
      {loading ? <Loading /> : !data?.length ? <Empty>No posts yet — start a conversation!</Empty> : data.map((p) => (
        <article key={p.id} className="card post">
          <div className="row between wrap"><span className="chip static">{p.category}</span><small className="muted">{timeAgo(p.created_at)}</small></div>
          <h3>{p.title}</h3>
          <p className="prewrap clamp3">{p.body}</p>
          <div className="row between wrap">
            <small className="muted">{p.author_title} {p.author} · {ROLE_LABEL[p.author_role]}{p.department_name ? ` · ${p.department_name}` : ''}</small>
            <div className="row gap">
              {p.user_id !== user.id && <Link className="btn ghost sm" to={`/messages/${p.user_id}`}>Message author</Link>}
              <button className="btn ghost sm" onClick={() => setOpenPost(p)}>💬 {p.comments} {p.comments === 1 ? 'reply' : 'replies'}</button>
              {(p.user_id === user.id || ['superadmin', 'sysadmin'].includes(user.role)) && <button className="btn ghost sm danger" title="Hide this post from the forum (kept on record)" onClick={async () => { try { await api.post(`/community/posts/${p.id}/archive`); toast('Post removed from the forum'); reload(); } catch (e) { toastErr(e); } }}>Remove</button>}
            </div>
          </div>
        </article>
      ))}
      {creating && <NewPost onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {openPost && <PostThread post={openPost} onClose={() => { setOpenPost(null); reload(); }} />}
    </>
  );
}

function NewPost({ onClose, onDone }) {
  const [f, setF] = useState({ category: 'General', title: '', body: '' });
  const save = async () => { try { await api.post('/community/posts', f); toast('Posted'); onDone(); } catch (e) { toastErr(e); } };
  return (
    <Modal title="New post" onClose={onClose}>
      <div className="stack">
        <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Details"><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="row end"><button className="btn" onClick={save}>Post</button></div>
      </div>
    </Modal>
  );
}

function PostThread({ post, onClose }) {
  const { data, reload } = useFetch(`/community/posts/${post.id}/comments`);
  const [text, setText] = useState('');
  const send = async () => { try { await api.post(`/community/posts/${post.id}/comments`, { body: text }); setText(''); reload(); } catch (e) { toastErr(e); } };
  return (
    <Modal title={post.title} onClose={onClose} wide>
      <p className="prewrap">{post.body}</p>
      <small className="muted">{post.author} · {timeAgo(post.created_at)}</small>
      <hr />
      {!data ? <Loading /> : data.map((c) => <div key={c.id} className="comment"><strong>{c.author}</strong> <small className="muted">{ROLE_LABEL[c.author_role]} · {timeAgo(c.created_at)}</small><p className="prewrap">{c.body}</p></div>)}
      <Field label="Reply"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="row end"><button className="btn" disabled={!text.trim()} onClick={send}>Reply</button></div>
    </Modal>
  );
}

function Directory() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('staff');
  const { data, loading } = useFetch(`/community/directory?role=${role}&search=${encodeURIComponent(search)}`);
  return (
    <>
      <div className="filters">
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Who"><option value="staff">Academic staff</option><option value="student">Students</option><option value="">Everyone</option></select>
        <input className="search" placeholder="Search by name, research interest or department…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <Loading /> : !data?.length ? <Empty>No one matches.</Empty> : (
        <div className="cards">{data.map((u) => (
          <div key={u.id} className="card person">
            <div className="row gap"><span className="avatar">{u.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
              <div><strong>{u.title} {u.name}</strong><br /><small className="muted">{ROLE_LABEL[u.role]}{u.level ? ` (${u.level})` : ''} · {u.department_name || u.faculty_name}</small></div></div>
            {u.research_interests && <div className="tags">{u.research_interests.split(/[,;]/).filter((x) => x.trim()).map((t) => <span key={t} className="chip static">{t.trim()}</span>)}</div>}
            {u.bio && <p className="small clamp3">{u.bio}</p>}
            <div className="row between"><small className="muted">{u.manuscripts} manuscript(s)</small>{u.id !== user.id && <Link className="btn ghost sm" to={`/messages/${u.id}`}>Connect</Link>}</div>
          </div>
        ))}</div>
      )}
    </>
  );
}
