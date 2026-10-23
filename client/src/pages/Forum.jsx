import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Empty, ErrorBox, Loading, Pager, ReportButton, timeAgo, useFetch } from '../components/ui';

const CATS = [['', 'All'], ['question', 'Questions'], ['discussion', 'Discussions'], ['resource', 'Resources'], ['showcase', 'Showcase'], ['announcement', 'Announcements']];

export function ForumList() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = params.toString();
  const { data, loading } = useFetch(`/forum/posts?${qs}`, [qs]);
  const tags = useFetch('/forum/tags');
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p); };
  return (
    <div className="grid-2">
      <div>
        <div className="page-head"><div><h1>Community forum</h1><p className="muted">Ask questions, share resources, show what you've learned.</p></div><Link className="btn" to="/forum/new">New post</Link></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); set('q', q); }} style={{ marginBottom: '.75rem' }}>
          <input type="search" aria-label="Search the forum" placeholder="Search posts" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <select aria-label="Sort" value={params.get('sort') || ''} onChange={(e) => set('sort', e.target.value)} style={{ width: 'auto' }}><option value="">Newest</option><option value="top">Most active</option><option value="unanswered">Unanswered</option></select>
        </form>
        <div className="row" style={{ marginBottom: '1rem' }}>{CATS.map(([k, l]) => <button key={k} className={`btn small ${(params.get('category') || '') === k ? '' : 'ghost'}`} onClick={() => set('category', k)}>{l}</button>)}</div>
        {params.get('tag') && <p>Tagged <span className="chip">#{params.get('tag')}</span> <button className="btn link small" onClick={() => set('tag', '')}>clear</button></p>}
        {loading && !data ? <Loading /> : !data?.items.length ? <Empty>Nothing here yet. Start the conversation.</Empty> : data.items.map((p) => (
          <Link key={p._id} to={`/forum/${p._id}`} className="card" style={{ display: 'block', color: 'inherit', marginBottom: '.75rem' }}>
            <div className="row">{p.pinned && <span className="chip gold">Pinned</span>}<span className="chip">{p.category}</span>{p.acceptedComment && <span className="chip teal">Answered</span>}{p.locked && <span className="chip">Locked</span>}</div>
            <h3 style={{ margin: '.5rem 0 .25rem' }}>{p.title}</h3>
            <p className="small muted" style={{ margin: 0 }}>{p.body}</p>
            <div className="row small muted" style={{ marginTop: '.5rem' }}><Avatar user={p.author} /> {p.author?.name} · {timeAgo(p.createdAt)} · {p.upvoteCount} upvotes · {p.commentCount} replies · {p.views} views</div>
          </Link>))}
        {data && <Pager page={data.page} pages={data.pages} onPage={(pg) => set('page', String(pg))} />}
      </div>
      <aside><div className="card"><h3>Popular tags</h3><div className="row">{tags.data?.items.map((t) => <button key={t.tag} className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => set('tag', t.tag)}>#{t.tag} · {t.count}</button>)}</div></div></aside>
    </div>
  );
}

export function NewPost() {
  const nav = useNavigate();
  const { isStaff } = useAuth();
  const [f, setF] = useState({ title: '', body: '', category: 'question', tags: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post('/forum/posts', { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) }); nav(`/forum/${data.post._id}`); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 760 }}>
      <h1>New post</h1>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="pc">Type</label><select id="pc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.slice(1).filter(([k]) => k !== 'announcement' || isStaff).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label htmlFor="pt">Title</label><input id="pt" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="pb">Body</label><textarea id="pb" required rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div className="field"><label htmlFor="pg">Tags</label><input id="pg" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="guitar, practice" /></div>
      <button className="btn">Publish post</button>
    </form>
  );
}

export function ForumPost() {
  const { id } = useParams();
  const { user, isStaff } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload, setData } = useFetch(`/forum/posts/${id}`, [id]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { post, comments } = data;
  const isAuthor = post.author._id === user._id;
  const call = async (fn, msg) => { try { await fn(); if (msg) toast(msg); reload(); } catch (x) { toast(errMsg(x), 'err'); } };
  const vote = async () => { const r = await api.post(`/forum/posts/${id}/upvote`); setData({ ...data, post: { ...post, upvoteCount: r.data.upvoteCount, upvotes: r.data.upvoted ? [...post.upvotes, user._id] : post.upvotes.filter((u) => u !== user._id) } }); };
  const comment = async (e) => { e.preventDefault(); await call(() => api.post(`/forum/posts/${id}/comments`, { body, parent: replyTo || undefined })); setBody(''); setReplyTo(null); };
  const top = comments.filter((c) => !c.parent);
  const replies = (cid) => comments.filter((c) => c.parent === cid);

  const Comment = ({ c, depth = 0 }) => (
    <div style={{ marginLeft: depth ? '1.5rem' : 0, borderLeft: depth ? '2px solid var(--line)' : 0, paddingLeft: depth ? '1rem' : 0 }}>
      <div className="card flat" style={{ marginBottom: '.5rem', borderColor: post.acceptedComment === c._id ? 'var(--teal)' : undefined }}>
        <div className="row small"><Avatar user={c.author} /><strong>{c.author?.name}</strong><span className="muted">{timeAgo(c.createdAt)}</span>{post.acceptedComment === c._id && <span className="chip teal">Accepted answer</span>}</div>
        <p style={{ margin: '.5rem 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
        <div className="row small">
          <button className="btn link small" onClick={() => call(() => api.post(`/forum/comments/${c._id}/upvote`))}>{c.upvotes.includes(user._id) ? 'Upvoted' : 'Upvote'} ({c.upvoteCount})</button>
          {!post.locked && depth === 0 && <button className="btn link small" onClick={() => setReplyTo(c._id)}>Reply</button>}
          {isAuthor && post.category === 'question' && c.author._id !== user._id && post.acceptedComment !== c._id && <button className="btn link small" onClick={() => call(() => api.post(`/forum/posts/${id}/accept`, { commentId: c._id }), 'Answer accepted')}>Accept answer</button>}
          {(c.author._id === user._id || isStaff) && <button className="btn link small" onClick={() => call(() => api.delete(`/forum/comments/${c._id}`), 'Comment deleted')}>Delete</button>}
          <ReportButton targetType="comment" targetId={c._id} />
        </div>
      </div>
      {replies(c._id).map((r) => <Comment key={r._id} c={r} depth={1} />)}
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link to="/forum" className="small">Back to forum</Link>
      <div className="card">
        <div className="row"><span className="chip">{post.category}</span>{post.pinned && <span className="chip gold">Pinned</span>}{post.locked && <span className="chip">Locked</span>}{post.tags.map((t) => <Link key={t} className="chip" to={`/forum?tag=${t}`}>#{t}</Link>)}</div>
        <h1 style={{ marginTop: '.75rem' }}>{post.title}</h1>
        <div className="row small muted"><Avatar user={post.author} /><Link to={`/users/${post.author._id}`}>{post.author.name}</Link> · {timeAgo(post.createdAt)} · {post.views} views</div>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{post.body}</p>
        <div className="row">
          <button className={`btn small ${post.upvotes.includes(user._id) ? '' : 'ghost'}`} onClick={vote}>Upvote · {post.upvoteCount}</button>
          {isStaff && <><button className="btn ghost small" onClick={() => call(() => api.put(`/forum/posts/${id}`, { pinned: !post.pinned }))}>{post.pinned ? 'Unpin' : 'Pin'}</button><button className="btn ghost small" onClick={() => call(() => api.put(`/forum/posts/${id}`, { locked: !post.locked }))}>{post.locked ? 'Unlock' : 'Lock'}</button></>}
          {(isAuthor || isStaff) && <button className="btn ghost small" onClick={async () => { if (window.confirm('Delete this post?')) { await api.delete(`/forum/posts/${id}`); nav('/forum'); } }}>Delete</button>}
          <ReportButton targetType="post" targetId={post._id} />
        </div>
      </div>
      <h2>{comments.length} {comments.length === 1 ? 'reply' : 'replies'}</h2>
      {top.map((c) => <Comment key={c._id} c={c} />)}
      {post.locked ? <p className="muted">This thread is locked.</p> : (
        <form className="card" onSubmit={comment}>
          {replyTo && <p className="small">Replying to a comment <button type="button" className="btn link small" onClick={() => setReplyTo(null)}>cancel</button></p>}
          <label htmlFor="cb">Your reply</label>
          <textarea id="cb" required value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn" style={{ marginTop: '.5rem' }}>Post reply</button>
        </form>
      )}
    </div>
  );
}
