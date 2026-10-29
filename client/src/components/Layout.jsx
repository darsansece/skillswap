import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../api/client';
import { Avatar, Coin, ErrorBoundary, timeAgo } from './ui';

const NAV = [
  ['Explore', [['/', 'Dashboard'], ['/marketplace', 'Marketplace'], ['/assistant', 'Learning assistant']]],
  ['Trade', [['/exchanges', 'Exchanges'], ['/messages', 'Messages'], ['/my-skills', 'My skills']]],
  ['Grow', [['/learn', 'Assessments & goals'], ['/rewards', 'Credits & rewards'], ['/forum', 'Community forum']]],
];

function Notifications() {
  const { unread, setUnread } = useSocket();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef();
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    api.get('/notifications?limit=15').then(({ data }) => { setItems(data.items); setUnread(data.unread); });
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setUnread]);
  const readAll = async () => { await api.post('/notifications/read-all'); setUnread(0); setItems((x) => x.map((n) => ({ ...n, read: true }))); };
  const go = async (n) => {
    if (!n.read) { await api.post(`/notifications/${n._id}/read`); setUnread((u) => Math.max(0, u - 1)); }
    setOpen(false); if (n.link) nav(n.link);
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn ghost small" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}>
        <span className="desk">Notifications</span><span className="mob" aria-hidden="true">Alerts</span> {unread > 0 && <span className="badge-count">{unread}</span>}
      </button>
      {open && (
        <div className="card pop" style={{ padding: '.5rem' }}>
          <div className="row between" style={{ padding: '.25rem .5rem' }}><strong>Notifications</strong>{unread > 0 && <button className="btn link small" onClick={readAll}>Mark all read</button>}</div>
          {!items.length && <p className="muted small" style={{ padding: '.5rem' }}>You're all caught up.</p>}
          {items.map((n) => (
            <button key={n._id} onClick={() => go(n)} style={{ display: 'block', width: '100%', textAlign: 'left', background: n.read ? 'none' : 'var(--teal-tint)', border: 0, borderRadius: 6, padding: '.55rem .6rem', cursor: 'pointer', color: 'inherit', font: 'inherit', marginBottom: 2 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{n.title}</div>
              {n.body && <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
              <div className="small muted">{timeAgo(n.createdAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('ss_theme') || '');
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    localStorage.setItem('ss_theme', theme);
  }, [theme]);
  const dark = theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="brand"><Coin value="" /> SkillSwap</Link>
        {NAV.map(([group, links]) => (
          <div key={group}>
            <div className="group">{group}</div>
            {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className="nav">{label}</NavLink>)}
          </div>
        ))}
        {isAdmin && (<div><div className="group">Administration</div><NavLink to="/admin" className="nav">Admin panel</NavLink></div>)}
        <div className="foot">
          <NavLink to="/profile" className="nav"><span className="row" style={{ gap: '.5rem' }}><Avatar user={user} /> <span>{user.name}<br /><span className="small" style={{ color: '#8590A8' }}>Level {user.level}</span></span></span></NavLink>
          <button className="btn ghost small logout" onClick={logout}>Log out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost small menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
          <Link to="/rewards" title="Available credits" style={{ color: 'inherit' }}><Coin value={user.credits} /></Link>
          <Notifications />
          <button className="btn ghost small" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle dark mode">{dark ? 'Light' : 'Dark'}</button>
          <button className="btn ghost small desk" onClick={logout}>Log out</button>
        </header>
        <main className="content"><ErrorBoundary><Outlet /></ErrorBoundary></main>
      </div>
    </div>
  );
}
