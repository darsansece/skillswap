import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { tokens } from '../api/client';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketCtx = createContext(null);

export function SocketProvider({ children }) {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const [socket, setSocket] = useState(null);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(() => new Set());
  const refreshRef = useRef(refreshMe);
  refreshRef.current = refreshMe;

  useEffect(() => {
    if (!user) return undefined;
    const s = io(import.meta.env.VITE_SOCKET_URL || '/', { auth: { token: tokens.access }, transports: ['websocket', 'polling'] });
    s.on('notification', (n) => {
      setUnread((u) => u + 1);
      toast(n.title);
      if (['credit', 'badge', 'system'].includes(n.type)) refreshRef.current();
    });
    s.on('presence', ({ userId, online: on }) => setOnline((prev) => { const nx = new Set(prev); if (on) nx.add(userId); else nx.delete(userId); return nx; }));
    setSocket(s);
    api.get('/notifications?limit=1').then(({ data }) => setUnread(data.unread)).catch(() => {});
    return () => { s.disconnect(); setSocket(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  return <SocketCtx.Provider value={{ socket, unread, setUnread, online, setOnline }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);
