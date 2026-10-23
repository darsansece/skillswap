import { useState } from 'react';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, Loading, Modal, Pager, Tabs, fmtDate, useFetch } from '../components/ui';

const TX_LABEL = { signup_bonus: 'Welcome bonus', escrow_hold: 'Held for exchange', escrow_release: 'Paid to mentor', escrow_refund: 'Refund', earned_teaching: 'Earned teaching', reward: 'Reward', admin_adjustment: 'Adjustment', transfer: 'Transfer' };

function Transfer({ onClose, onDone }) {
  const [q, setQ] = useState('');
  const [to, setTo] = useState(null);
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState('');
  const toast = useToast();
  const people = useFetch(q.length > 1 ? `/users?q=${encodeURIComponent(q)}&limit=5` : null, [q]);
  const send = async () => {
    try { await api.post('/rewards/transfer', { toUserId: to._id, amount: Number(amount), note }); toast(`Sent ${amount} credits to ${to.name}`); onDone(); onClose(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <Modal title="Send credits" onClose={onClose}>
      {!to ? (
        <>
          <div className="field"><label htmlFor="who">Find a member</label><input id="who" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" /></div>
          {people.data?.items?.map((p) => <button key={p._id} className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }} onClick={() => setTo(p)}><Avatar user={p} /> {p.name}</button>)}
        </>
      ) : (
        <>
          <p>To <strong>{to.name}</strong> <button className="btn link small" onClick={() => setTo(null)}>change</button></p>
          <div className="field"><label htmlFor="amt">Amount</label><input id="amt" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label htmlFor="nt">Note</label><input id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thanks for the extra help!" /></div>
          <button className="btn" onClick={send}>Send credits</button>
        </>
      )}
    </Modal>
  );
}

export default function Rewards() {
  const { user, refreshMe } = useAuth();
  const [tab, setTab] = useState('wallet');
  const [page, setPage] = useState(1);
  const [by, setBy] = useState('points');
  const [sending, setSending] = useState(false);
  const wallet = useFetch(`/rewards/wallet?page=${page}`, [page]);
  const prog = useFetch('/rewards/progress');
  const board = useFetch(`/rewards/leaderboard?by=${by}`, [by]);
  const reload = () => { wallet.reload(); refreshMe(); };

  return (
    <div>
      <div className="page-head"><h1>Credits & rewards</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['wallet', 'Wallet'], ['progress', 'Level & badges'], ['board', 'Leaderboard']]} />
      {tab === 'wallet' && (wallet.data ? (
        <div className="stack">
          <div className="card row between">
            <div><Coin value={wallet.data.balance} big /><div className="muted">available{wallet.data.held ? `, plus ${wallet.data.held} held for booked sessions` : ''}</div></div>
            <div className="row">
              <div className="stat"><div className="v" style={{ color: 'var(--teal)' }}>+{wallet.data.totalEarned}</div><div className="l">Earned all time</div></div>
              <div className="stat"><div className="v">−{wallet.data.totalSpent}</div><div className="l">Spent all time</div></div>
              <button className="btn" onClick={() => setSending(true)}>Send credits</button>
            </div>
          </div>
          <p className="small muted">Teach one hour, earn the listing's rate. Credits for a booked exchange are held when the mentor accepts and released only after both of you confirm each session.</p>
          <div className="card table-wrap"><table>
            <thead><tr><th>Date</th><th>What</th><th>Details</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
            <tbody>{wallet.data.items.map((t) => (
              <tr key={t._id}><td className="small">{fmtDate(t.createdAt)}</td><td>{TX_LABEL[t.type] || t.type}</td><td className="small muted">{t.description}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: t.amount > 0 ? 'var(--teal)' : t.amount < 0 ? 'var(--rose)' : 'inherit' }}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                <td style={{ textAlign: 'right' }} className="small">{t.balanceAfter ?? ''}</td></tr>))}</tbody>
          </table></div>
          <Pager page={page} pages={Math.ceil(wallet.data.total / 20)} onPage={setPage} />
        </div>
      ) : <Loading />)}
      {tab === 'progress' && (prog.data ? (
        <div className="stack">
          <div className="card">
            <div className="row between"><h2 style={{ margin: 0 }}>Level {prog.data.level}</h2><span className="muted">{prog.data.points} points{prog.data.nextLevelAt ? ` · ${prog.data.nextLevelAt - prog.data.points} to level ${prog.data.level + 1}` : ' · top level'}</span></div>
            <div className="bar" style={{ marginTop: '.75rem' }} role="progressbar" aria-valuenow={prog.data.levelProgress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${prog.data.levelProgress}%` }} /></div>
            <p className="small muted" style={{ marginTop: '.75rem' }}>Login streak: {prog.data.loginStreak} days. Earn points by teaching (+50), learning (+20), reviewing (+10), passing assessments (+40) and having forum answers accepted (+25).</p>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {prog.data.badges.map((b) => (
              <div key={b.key} className={`card badge-tile ${b.earned ? '' : 'locked'}`}>
                <div className="ic" aria-hidden="true">{b.icon}</div><strong>{b.name}</strong><div className="small muted">{b.description}</div>
                {b.earned && <div className="small" style={{ color: 'var(--teal)' }}>Earned</div>}
              </div>))}
          </div>
        </div>
      ) : <Loading />)}
      {tab === 'board' && (
        <div className="stack">
          <div className="row">{[['points', 'Points'], ['teaching', 'Sessions taught'], ['hours', 'Hours taught']].map(([k, l]) => <button key={k} className={`btn small ${by === k ? '' : 'ghost'}`} onClick={() => setBy(k)}>{l}</button>)}
            {board.data && <span className="muted small">Your rank by points: #{board.data.myRank}</span>}</div>
          <div className="card table-wrap"><table>
            <thead><tr><th>#</th><th>Member</th><th>Level</th><th>Points</th><th>Taught</th><th>Hours</th></tr></thead>
            <tbody>{board.data?.items.map((u, i) => (
              <tr key={u._id} style={u._id === user._id ? { background: 'var(--teal-tint)' } : undefined}>
                <td><strong>{i + 1}</strong></td><td><span className="row" style={{ flexWrap: 'nowrap' }}><Avatar user={u} />{u.name}</span></td>
                <td>{u.level}</td><td>{u.points}</td><td>{u.stats.sessionsTaught}</td><td>{u.stats.hoursTaught}</td></tr>))}</tbody>
          </table></div>
        </div>
      )}
      {sending && <Transfer onClose={() => setSending(false)} onDone={reload} />}
    </div>
  );
}
