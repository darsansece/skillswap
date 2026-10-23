import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Avatar, ReportButton, timeAgo } from '../components/ui';

export default function Messages() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket, online, setOnline } = useSocket();
  const toast = useToast();
  const [convos, setConvos] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(null);
  const endRef = useRef();
  const typingTimer = useRef();

  const loadConvos = () => api.get('/conversations').then(({ data }) => setConvos(data.items));
  useEffect(() => { loadConvos(); }, []);
  useEffect(() => {
    if (!socket || !convos.length) return;
    const ids = convos.flatMap((c) => c.participants.map((p) => p._id));
    socket.emit('presence:list', ids, (on) => setOnline(new Set(on)));
  }, [socket, convos, setOnline]);
  useEffect(() => {
    if (!id) return;
    api.get(`/conversations/${id}/messages`).then(({ data }) => setMsgs(data.items));
    api.post(`/conversations/${id}/read`).then(() => setConvos((cs) => cs.map((c) => (c._id === id ? { ...c, unread: 0 } : c))));
  }, [id]);
  useEffect(() => {
    if (!socket) return undefined;
    const onMsg = ({ conversationId, message }) => {
      if (conversationId === id) {
        setMsgs((m) => (m.some((x) => x._id === message._id) ? m : [...m, message]));
        if (message.sender._id !== user._id) api.post(`/conversations/${id}/read`);
      }
      setConvos((cs) => {
        const known = cs.some((c) => c._id === conversationId);
        if (!known) { loadConvos(); return cs; }
        return cs.map((c) => (c._id === conversationId ? { ...c, lastMessage: { text: message.text, at: message.createdAt }, unread: conversationId === id || message.sender._id === user._id ? 0 : (c.unread || 0) + 1 } : c))
          .sort((a, b) => new Date(b.lastMessage?.at || 0) - new Date(a.lastMessage?.at || 0));
      });
    };
    const onTyping = (t) => { if (t.conversationId === id) setTyping(t.typing ? t.name : null); };
    socket.on('message:new', onMsg);
    socket.on('typing', onTyping);
    return () => { socket.off('message:new', onMsg); socket.off('typing', onTyping); };
  }, [socket, id, user._id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, typing]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    setText('');
    socket?.emit('typing', { conversationId: id, typing: false });
    if (socket?.connected) {
      socket.emit('message:send', { conversationId: id, text: t }, (ack) => { if (!ack.ok) toast(ack.error, 'err'); });
    } else {
      api.post(`/conversations/${id}/messages`, { text: t }).then(({ data }) => setMsgs((m) => [...m, data.message])).catch((x) => toast(errMsg(x), 'err'));
    }
  };
  const onType = (v) => {
    setText(v);
    socket?.emit('typing', { conversationId: id, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit('typing', { conversationId: id, typing: false }), 1500);
  };
  const attach = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await api.post('/uploads', fd);
      socket?.emit('message:send', { conversationId: id, text: '', attachment: data });
    } catch (x) { toast(errMsg(x), 'err'); }
    e.target.value = '';
  };

  const active = convos.find((c) => c._id === id);
  const other = (c) => c.participants.find((p) => p._id !== user._id) || c.participants[0];
  return (
    <div>
      <h1>Messages</h1>
      <div className={`chat ${id ? 'has-active' : ''}`}>
        <div className="list">
          {!convos.length && <p className="muted small" style={{ padding: '1rem' }}>No conversations yet. Message someone from their profile or a skill page.</p>}
          {convos.map((c) => {
            const o = other(c);
            return (
              <Link key={c._id} to={`/messages/${c._id}`} className={c._id === id ? 'active' : ''}>
                <Avatar user={o} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row between" style={{ flexWrap: 'nowrap' }}><strong>{o.name}</strong>{c.unread > 0 && <span className="badge-count">{c.unread}</span>}</div>
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span className={`dot ${online.has(o._id) ? 'on' : ''}`} /> {c.lastMessage?.text || 'No messages yet'}</div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="pane">
          {!active ? <div className="empty" style={{ margin: 'auto', border: 0 }}>Choose a conversation.</div> : (
            <>
              <div className="row between" style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <div className="row"><Link to="/messages" className="btn ghost small menu-btn" aria-label="Back to conversations">Back</Link><Avatar user={other(active)} /><div><Link to={`/users/${other(active)._id}`} style={{ color: 'inherit', fontWeight: 700 }}>{other(active).name}</Link><div className="small muted">{online.has(other(active)._id) ? 'Online' : other(active).lastSeen ? `Last seen ${timeAgo(other(active).lastSeen)}` : 'Offline'}</div></div></div>
              </div>
              <div className="msgs" aria-live="polite">
                {msgs.map((m) => {
                  const mine = m.sender._id === user._id;
                  const read = mine && m.readBy?.length > 1;
                  return (
                    <div key={m._id} className={`bubble ${mine ? 'me' : ''}`}>
                      {m.text}
                      {m.attachment?.url && <div><a href={m.attachment.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{m.attachment.name}</a></div>}
                      <div className="t">{timeAgo(m.createdAt)}{mine && read ? ' · read' : ''}{!mine && <> · <ReportButton targetType="message" targetId={m._id} /></>}</div>
                    </div>
                  );
                })}
                {typing && <div className="small muted">{typing} is typing…</div>}
                <div ref={endRef} />
              </div>
              <form onSubmit={send}>
                <label className="btn ghost small" style={{ margin: 0 }} title="Attach a file">Attach<input type="file" hidden onChange={attach} /></label>
                <input aria-label="Message" value={text} onChange={(e) => onType(e.target.value)} placeholder="Write a message" style={{ flex: 1 }} />
                <button className="btn">Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
