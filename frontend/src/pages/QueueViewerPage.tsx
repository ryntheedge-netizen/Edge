import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Users, Clock3 } from 'lucide-react';
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

export const QueueViewerPage: React.FC = () => {
  const { apiFetch } = useApi();
  const { channel } = useSocket();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadActivities = useCallback(async () => {
    const res = await apiFetch('/api/queue/activities');
    if (!res.ok) throw new Error('Could not load events');
    const data = await res.json();
    setActivities(data.activities || []);
    setActivityId(current => current ?? (data.activities?.[0]?.id ?? null));
  }, [apiFetch]);

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

  return (
    <div style={{ minHeight: '100%', overflowY: 'auto', padding: '2rem' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ color: '#60a5fa', fontSize: 12, fontWeight: 800, letterSpacing: '.12em' }}>EDGE QUEUE STATUS</div>
            <h1 style={{ margin: '4px 0', color: '#fff', fontSize: 32 }}>Live Queue</h1>
            <p style={{ margin: 0, color: '#94a3b8' }}>View-only status of teams waiting and in evaluation.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={activityId ?? ''} onChange={e => setActivityId(Number(e.target.value))} style={selectStyle}>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={round} onChange={e => setRound(Number(e.target.value))} style={selectStyle}>
              <option value={1}>Round 1</option>
              <option value={2}>Round 2</option>
            </select>
            <button onClick={loadBoard} style={refreshButton}><RefreshCw size={16} /> Refresh</button>
          </div>
        </div>

        {message && <div style={alert}>{message}</div>}

        {loading ? <div style={loadingBox}><Clock3 size={22} /> Loading queue…</div> : (
          <div style={grid}>
            <section style={column}>
              <header style={header}><div><h2 style={title}>Waiting</h2><span style={sub}>{waiting.length} team{waiting.length === 1 ? '' : 's'}</span></div><b style={badge}>{waiting.length}</b></header>
              <div style={{ display: 'grid', gap: 10 }}>
                {waiting.length ? waiting.map(e => <TeamCard key={e.id} entry={e} />) : <div style={empty}>No teams waiting.</div>}
              </div>
            </section>
            <section style={column}>
              <header style={header}><div><h2 style={title}>Evaluation Room 1</h2><span style={sub}>Current team</span></div><span style={statusDot(eval1)} /></header>
              {eval1 ? <TeamCard entry={eval1} large /> : <div style={empty}>ROOM AVAILABLE</div>}
            </section>
            <section style={column}>
              <header style={header}><div><h2 style={title}>Evaluation Room 2</h2><span style={sub}>Current team</span></div><span style={statusDot(eval2)} /></header>
              {eval2 ? <TeamCard entry={eval2} large /> : <div style={empty}>ROOM AVAILABLE</div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

function TeamCard({ entry, large = false }: { entry: QueueEntry; large?: boolean }) {
  return <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(148,163,184,.15)', borderRadius: 10, padding: large ? 22 : 14 }}>
    <div style={{ color: '#60a5fa', fontSize: 12, fontWeight: 800, letterSpacing: '.1em' }}>TOKEN {entry.token_number}</div>
    <div style={{ color: '#fff', fontWeight: 800, fontSize: large ? 22 : 16, marginTop: 4 }}>{entry.team_name}</div>
    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 3 }}>{entry.team_code || 'NO CODE'}</div>
    {large && <div style={{ marginTop: 14, color: '#86efac', fontSize: 13, display: 'flex', gap: 7, alignItems: 'center' }}><Users size={15} /> In evaluation</div>}
  </div>;
}

const selectStyle: React.CSSProperties = { background: 'var(--bg-panel)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', fontWeight: 600 };
const refreshButton: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-panel)', color: '#cbd5e1', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', fontWeight: 600 };
const alert: React.CSSProperties = { marginBottom: 16, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#fca5a5' };
const loadingBox: React.CSSProperties = { minHeight: 300, display: 'grid', placeItems: 'center', color: '#94a3b8' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr', gap: 16, alignItems: 'start' };
const column: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16, minHeight: 320 };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 14, borderBottom: '1px solid var(--border-color)' };
const title: React.CSSProperties = { color: '#fff', fontSize: 17, margin: 0 };
const sub: React.CSSProperties = { color: '#64748b', fontSize: 12 };
const badge: React.CSSProperties = { background: 'rgba(59,130,246,.12)', color: '#60a5fa', padding: '3px 9px', borderRadius: 99 };
const empty: React.CSSProperties = { minHeight: 180, display: 'grid', placeItems: 'center', border: '1px dashed rgba(148,163,184,.2)', borderRadius: 10, color: '#64748b', fontSize: 13 };
const statusDot = (entry?: QueueEntry): React.CSSProperties => ({ width: 10, height: 10, borderRadius: '50%', background: entry ? '#22c55e' : '#475569', boxShadow: entry ? '0 0 10px rgba(34,197,94,.55)' : 'none' });
