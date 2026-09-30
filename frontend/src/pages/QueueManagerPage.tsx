import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, RefreshCw, Users, Play, RotateCcw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useSocket } from '../context/SocketContext';

interface Activity { id: number; name: string; }
interface QueueEntry {
  id: number;
  token_number: number;
  location: 'WAITING' | 'EVALUATION_1' | 'EVALUATION_2' | 'COMPLETED';
  queue_position: number;
  team_id: number;
  team_name: string;
  team_code: string | null;
}


export const QueueManagerPage: React.FC = () => {
  const { apiFetch } = useApi();
  const { channel } = useSocket();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadActivities = useCallback(async () => {
    const res = await apiFetch('/api/queue/activities');
    if (!res.ok) throw new Error('Could not load sub-events');
    const data = await res.json();
    setActivities(data.activities || []);
    if (!activityId && data.activities?.length) setActivityId(data.activities[0].id);
  }, [apiFetch, activityId]);

  const loadBoard = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/queue/board?activityId=${activityId}&round=${round}`);
      if (!res.ok) throw new Error('Could not load queue');
      const data = await res.json();
      setEntries(data.entries || []);
      setMessage('');
    } catch (err: any) {
      setMessage(err.message || 'Could not load queue');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, activityId, round]);

  useEffect(() => { loadActivities().catch(e => setMessage(e.message)); }, [loadActivities]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  useEffect(() => {
    if (!channel) return;
    const handler = (payload: any) => {
      if (payload?.activityId === activityId && Number(payload?.round) === round) loadBoard();
    };
    channel.bind('queue-updated', handler);
    return () => channel.unbind('queue-updated', handler);
  }, [channel, activityId, round, loadBoard]);

  const waiting = useMemo(() => entries.filter(e => e.location === 'WAITING').sort((a, b) => a.queue_position - b.queue_position), [entries]);
  const eval1 = entries.find(e => e.location === 'EVALUATION_1');
  const eval2 = entries.find(e => e.location === 'EVALUATION_2');
  const completed = entries.filter(e => e.location === 'COMPLETED').length;
  const next = waiting[0];

  const action = async (type: 'move' | 'complete', room?: 'EVALUATION_1' | 'EVALUATION_2') => {
    if (!activityId) return;
    const key = `${type}-${room || ''}`;
    setBusy(key);
    setMessage('');
    try {
      const res = await apiFetch(`/api/queue/${type === 'move' ? 'move-next' : 'complete'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, round, ...(room ? { room } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      await loadBoard();
    } catch (err: any) {
      setMessage(err.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!activityId) return;
    if (!window.confirm('Reset this round queue? All teams will return to Waiting.')) return;
    setBusy('reset');
    try {
      const res = await apiFetch('/api/queue/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, round }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      await loadBoard();
    } catch (err: any) {
      setMessage(err.message || 'Reset failed');
    } finally {
      setBusy(null);
    }
  };

  const TeamCard = ({ entry, compact = false }: { entry?: QueueEntry; compact?: boolean }) => {
    if (!entry) return <div style={emptyRoom}>ROOM AVAILABLE</div>;
    return (
      <div style={{ ...teamCard, padding: compact ? '1rem' : '1.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={tokenLabel}>TOKEN {entry.token_number}</div>
            <div style={teamName}>{entry.team_name}</div>
            <div style={teamCode}>{entry.team_code || 'NO CODE'}</div>
          </div>
          <Users size={20} style={{ color: '#60a5fa' }} />
        </div>
      </div>
    );
  };

  return (
    <div className="queue-page-pad" style={{ height: '100%', overflowY: 'auto', padding: '1.5rem 2rem 3rem' }}>
      <style>{`@media (max-width: 1000px) { .queue-board-grid { grid-template-columns: 1fr !important; } } @media (max-width: 700px) { .queue-page-pad { padding: 1rem !important; } }`}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ color: '#60a5fa', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>EDGE Queue</div>
            <h1 style={{ margin: '0.25rem 0 0', color: '#fff', fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>Token Management</h1>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>Who's where and who's next.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={selectWrap}>
              <select value={activityId ?? ''} onChange={e => setActivityId(Number(e.target.value))} style={selectStyle}>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={16} style={selectIcon} />
            </div>
            <div style={selectWrap}>
              <select value={round} onChange={e => setRound(Number(e.target.value))} style={selectStyle}>
                <option value={1}>Round 1</option>
                <option value={2}>Round 2</option>
              </select>
              <ChevronDown size={16} style={selectIcon} />
            </div>
            <button onClick={() => loadBoard()} style={iconButton} title="Refresh"><RefreshCw size={17} /></button>
            <button onClick={reset} disabled={busy === 'reset'} style={{ ...secondaryButton, opacity: busy === 'reset' ? .6 : 1 }}><RotateCcw size={16} /> Reset</button>
          </div>
        </div>

        {message && <div style={alert}>{message}</div>}

        <div style={statsRow}>
          <div style={stat}><span>Waiting</span><strong>{waiting.length}</strong></div>
          <div style={stat}><span>In Evaluation</span><strong>{(eval1 ? 1 : 0) + (eval2 ? 1 : 0)}</strong></div>
          <div style={stat}><span>Completed</span><strong>{completed}</strong></div>
          <div style={{ ...stat, marginLeft: 'auto' }}><span>Next</span><strong>{next ? `TOKEN ${next.token_number}` : '—'}</strong></div>
        </div>

        {loading ? (
          <div style={loadingBox}><Clock3 size={22} /> Loading queue…</div>
        ) : (
          <>
            <div className="queue-board-grid" style={boardGrid}>
              <section style={column}>
                <div style={columnHeader}><div><div style={columnTitle}>Waiting Room</div><div style={columnSub}>{waiting.length} team{waiting.length === 1 ? '' : 's'} waiting</div></div><span style={countBadge}>{waiting.length}</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {waiting.length ? waiting.map(entry => <TeamCard key={entry.id} entry={entry} compact />) : <div style={emptyQueue}>No teams waiting.</div>}
                </div>
              </section>

              <section style={column}>
                <div style={columnHeader}><div><div style={columnTitle}>Evaluation Room 1</div><div style={columnSub}>One team at a time</div></div><span style={roomDot(eval1)} /></div>
                <TeamCard entry={eval1} />
                {eval1 && <button onClick={() => action('complete', 'EVALUATION_1')} disabled={!!busy} style={completeButton}><CheckCircle2 size={17} /> Complete Token {eval1.token_number}</button>}
                {!eval1 && next && <button onClick={() => action('move', 'EVALUATION_1')} disabled={!!busy} style={primaryButton}><Play size={17} /> Send Token {next.token_number}</button>}
              </section>

              <section style={column}>
                <div style={columnHeader}><div><div style={columnTitle}>Evaluation Room 2</div><div style={columnSub}>One team at a time</div></div><span style={roomDot(eval2)} /></div>
                <TeamCard entry={eval2} />
                {eval2 && <button onClick={() => action('complete', 'EVALUATION_2')} disabled={!!busy} style={completeButton}><CheckCircle2 size={17} /> Complete Token {eval2.token_number}</button>}
                {!eval2 && next && <button onClick={() => action('move', 'EVALUATION_2')} disabled={!!busy} style={primaryButton}><Play size={17} /> Send Token {next.token_number}</button>}
              </section>
            </div>

            <div style={nextPanel}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Next token</div>
                {next ? <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '.2rem' }}><strong style={{ color: '#fff', fontSize: '1.5rem' }}>TOKEN {next.token_number}</strong><span style={{ color: '#cbd5e1' }}>{next.team_name}</span><span style={{ color: '#64748b' }}>{next.team_code || ''}</span></div> : <div style={{ color: '#64748b', marginTop: '.2rem' }}>No next team.</div>}
              </div>
              {next && <div style={{ display: 'flex', gap: '.5rem' }}>
                {!eval1 && <button onClick={() => action('move', 'EVALUATION_1')} disabled={!!busy} style={primaryButton}><Play size={16} /> Evaluation 1</button>}
                {!eval2 && <button onClick={() => action('move', 'EVALUATION_2')} disabled={!!busy} style={primaryButton}><Play size={16} /> Evaluation 2</button>}
              </div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const selectWrap: React.CSSProperties = { position: 'relative', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8 };
const selectStyle: React.CSSProperties = { appearance: 'none', background: 'transparent', color: '#fff', border: 0, outline: 0, padding: '0.65rem 2.2rem 0.65rem 0.85rem', minWidth: 150, fontWeight: 600, cursor: 'pointer' };
const selectIcon: React.CSSProperties = { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' };
const iconButton: React.CSSProperties = { width: 38, height: 38, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: '#cbd5e1', display: 'grid', placeItems: 'center', cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '0.65rem 0.9rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600 };
const alert: React.CSSProperties = { marginBottom: '1rem', padding: '.8rem 1rem', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#fca5a5' };
const statsRow: React.CSSProperties = { display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' };
const stat: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 9, padding: '.75rem 1rem', minWidth: 120, display: 'flex', flexDirection: 'column', gap: '.15rem' };
const boardGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr', gap: '1rem', alignItems: 'start' };
const column: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1rem', minHeight: 320 };
const columnHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '.8rem', borderBottom: '1px solid var(--border-color)' };
const columnTitle: React.CSSProperties = { color: '#fff', fontWeight: 800, fontSize: '1rem' };
const columnSub: React.CSSProperties = { color: '#64748b', fontSize: '.75rem', marginTop: '.15rem' };
const countBadge: React.CSSProperties = { background: 'rgba(59,130,246,.12)', color: '#60a5fa', padding: '.2rem .55rem', borderRadius: 99, fontWeight: 800, fontSize: '.8rem' };
const teamCard: React.CSSProperties = { background: 'rgba(255,255,255,.025)', border: '1px solid rgba(148,163,184,.15)', borderRadius: 10 };
const tokenLabel: React.CSSProperties = { color: '#60a5fa', fontWeight: 800, fontSize: '.72rem', letterSpacing: '.1em' };
const teamName: React.CSSProperties = { color: '#fff', fontWeight: 800, fontSize: '1.05rem', marginTop: '.2rem' };
const teamCode: React.CSSProperties = { color: '#94a3b8', fontSize: '.8rem', marginTop: '.2rem' };
const emptyRoom: React.CSSProperties = { minHeight: 170, border: '1px dashed rgba(148,163,184,.2)', borderRadius: 10, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '.8rem', letterSpacing: '.08em' };
const emptyQueue: React.CSSProperties = { padding: '2rem 1rem', textAlign: 'center', color: '#64748b', border: '1px dashed rgba(148,163,184,.2)', borderRadius: 10 };
const primaryButton: React.CSSProperties = { marginTop: '.75rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '.75rem 1rem', border: 0, borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 800 };
const completeButton: React.CSSProperties = { marginTop: '.75rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '.75rem 1rem', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, background: 'rgba(34,197,94,.1)', color: '#86efac', cursor: 'pointer', fontWeight: 800 };
const nextPanel: React.CSSProperties = { marginTop: '1rem', background: 'linear-gradient(135deg, rgba(37,99,235,.16), rgba(15,23,42,.6))', border: '1px solid rgba(59,130,246,.3)', borderRadius: 12, padding: '1rem 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' };
const loadingBox: React.CSSProperties = { minHeight: 300, display: 'grid', placeItems: 'center', color: '#94a3b8', gap: '.5rem' };
const roomDot = (entry?: QueueEntry): React.CSSProperties => ({ width: 9, height: 9, borderRadius: '50%', background: entry ? '#22c55e' : '#475569', boxShadow: entry ? '0 0 10px rgba(34,197,94,.55)' : 'none' });
