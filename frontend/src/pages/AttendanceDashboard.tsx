import React, { useEffect, useState, useMemo } from 'react';
import { EdgeLayout } from '../components/EdgeLayout';
import { useAuth } from '../context/AuthContext';
import { Users, QrCode, BarChart, UserX, Search, BookOpen, RotateCcw } from 'lucide-react';

export const AttendanceDashboardPage: React.FC = () => {
  const { token, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  
  // Modals state
  const [absenteeModal, setAbsenteeModal] = useState<{ open: boolean, stageName: string, stageId: number, absentees: any[] }>({ open: false, stageName: '', stageId: 0, absentees: [] });
  const [absenteeSearch, setAbsenteeSearch] = useState('');
  
  // History search state
  const [historySearch, setHistorySearch] = useState('');
  const [historyData, setHistoryData] = useState<{ participant: any, history: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const fetchData = () => {
    fetch('/api/attendance/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        const d = await res.json();
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error(d.error || 'Failed to fetch');
        return d;
      })
      .then(d => setData(d))
      .catch(err => setData({ error: err.message }));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token, logout]);

  const handleRevertScan = async (id: number) => {
    if (!confirm('Are you sure you want to revert this scan?')) return;
    try {
      await fetch(`/api/attendance/scan/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      console.error("Failed to revert scan", err);
    }
  };

  const handleFinalize = async (id: number, expected: number, present: number) => {
    const pending = expected - present;
    if (!confirm(`Finalize Attendance?\n\nExpected: ${expected}\nPresent: ${present}\nPending: ${pending}\n\nAfter finalization, the ${pending} pending participants will be recorded as absent for reporting purposes. Existing attendance records will not be deleted.`)) return;
    try {
      const res = await fetch(`/api/attendance/stage/${id}/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) {
        fetchData();
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevertFinalize = async (id: number) => {
    if (!confirm('Revert Attendance Finalization?\n\nReopening this stage will allow attendance tracking again. Existing attendance records will not be deleted.')) return;
    try {
      const res = await fetch(`/api/attendance/stage/${id}/revert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openAbsentees = async (stageId: number, stageName: string) => {
    try {
      const res = await fetch(`/api/attendance/absentees?stage_id=${stageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) {
        setAbsenteeSearch('');
        setAbsenteeModal({ open: true, stageName, stageId, absentees: result.absentees });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historySearch.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/attendance/participant/${historySearch.trim()}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) setHistoryData(result);
      else setHistoryData(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const filteredAbsentees = useMemo(() => {
    if (!absenteeSearch) return absenteeModal.absentees;
    const lower = absenteeSearch.toLowerCase();
    return absenteeModal.absentees.filter(a => 
      (a.participant_id || '').toLowerCase().includes(lower) ||
      (a.name || '').toLowerCase().includes(lower) ||
      (a.contact || '').toLowerCase().includes(lower) ||
      (a.team_code || '').toLowerCase().includes(lower) ||
      (a.team_name || '').toLowerCase().includes(lower)
    );
  }, [absenteeModal.absentees, absenteeSearch]);

  return (
    <EdgeLayout title="Attendance Dashboard">
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => navigate('/attendance/scanner')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <QrCode size={18} /> Scanning Stations
          </button>
          <button onClick={() => navigate('/attendance/qr-book')} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={18} /> QR Book
          </button>
        </div>

        {!data ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading metrics...</div>
        ) : data.error ? (
          <div style={{ color: '#ef4444', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
            Error: {data.error}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', color: '#3b82f6' }}><Users size={28} /></div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Eligible Participants</div>
                  <div style={{ fontSize: '1.75rem', color: '#fff', fontWeight: 'bold' }}>{data.totalParticipants}</div>
                </div>
              </div>

              <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', color: '#10b981' }}><BarChart size={28} /></div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Scans Recorded</div>
                  <div style={{ fontSize: '1.75rem', color: '#fff', fontWeight: 'bold' }}>{data.totalRecords}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Stage-wise Table */}
                <div className="panel-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ color: '#fff', margin: '0 0 1.5rem 0', fontFamily: 'var(--font-heading)' }}>Stage-wise Attendance</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '0.75rem' }}>Stage</th>
                          <th style={{ padding: '0.75rem' }}>Status</th>
                          <th style={{ padding: '0.75rem' }}>Expected</th>
                          <th style={{ padding: '0.75rem' }}>Present</th>
                          <th style={{ padding: '0.75rem' }}>Pending/Absent</th>
                          <th style={{ padding: '0.75rem' }}>%</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stageStats?.map((s: any) => {
                          const expected = s.expected;
                          const pct = typeof expected === 'number' && expected > 0 ? ((s.present / expected) * 100).toFixed(1) + '%' : '-';
                          const missing = Math.max(0, expected - s.present);
                          
                          return (
                            <tr key={`${s.stage_type}-${s.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '1rem 0.75rem', color: '#fff' }}>
                                <div>{s.name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.stage_type} • Day {s.day}</div>
                              </td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', 
                                  backgroundColor: s.status === 'FINALIZED' ? 'rgba(16, 185, 129, 0.1)' : (s.status === 'ACTIVE' || s.status === 'REOPENED') ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.05)', 
                                  color: s.status === 'FINALIZED' ? '#10b981' : (s.status === 'ACTIVE' || s.status === 'REOPENED') ? '#3b82f6' : 'var(--text-muted)' }}>
                                  {s.status}
                                </span>
                              </td>
                              <td style={{ padding: '1rem 0.75rem', color: 'var(--text-muted)' }}>{expected}</td>
                              <td style={{ padding: '1rem 0.75rem', color: '#10b981', fontWeight: 'bold' }}>{s.present}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                {missing > 0 ? (
                                  <button onClick={() => openAbsentees(s.id, s.name)} className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: s.status === 'FINALIZED' ? '#ef4444' : '#f59e0b', borderColor: s.status === 'FINALIZED' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)' }}>
                                    View {missing} {s.status === 'FINALIZED' ? 'Absent' : 'Pending'}
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>0</span>
                                )}
                              </td>
                              <td style={{ padding: '1rem 0.75rem', color: '#fff' }}>{pct}</td>
                              <td style={{ padding: '1rem 0.75rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                {(s.status === 'ACTIVE' || s.status === 'REOPENED') && (
                                  <button onClick={() => handleFinalize(s.id, expected, s.present)} className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>Finalize</button>
                                )}
                                {s.status === 'FINALIZED' && (
                                  <button onClick={() => handleRevertFinalize(s.id)} className="btn btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <RotateCcw size={12} /> Revert
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sidebar Tools */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="panel-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Search size={18} /> Participant History</h3>
                  <form onSubmit={handleSearchHistory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value.toUpperCase())} placeholder="EDG26-001" className="input-field" style={{ flex: 1 }} />
                    <button type="submit" className="btn btn-primary" disabled={isSearching}>Find</button>
                  </form>

                  {historyData && historyData.participant && (
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem' }}>{historyData.participant.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        {historyData.participant.participant_id} <br/>
                        Contact: {historyData.participant.contact || 'N/A'} <br/>
                        Team: {historyData.participant.team_code || '-'}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {historyData.history.map((h: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                            <div>
                              <div style={{ color: '#fff', fontSize: '0.85rem' }}>{h.stage_name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{h.category}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: h.status === 'Present' ? 'rgba(16,185,129,0.1)' : h.status === 'Absent' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.1)', color: h.status === 'Present' ? '#10b981' : h.status === 'Absent' ? '#ef4444' : '#ccc' }}>
                                {h.status}
                              </span>
                              {h.timestamp && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{new Date(h.timestamp).toLocaleTimeString()}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {historyData && !historyData.participant && (
                    <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>Participant not found.</div>
                  )}
                </div>

                <div className="panel-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)' }}>Recent Scans</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {data.recentScans?.map((scan: any) => (
                      <div key={scan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <div style={{ color: '#fff', fontSize: '0.9rem' }}>{scan.participant_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{scan.participant_id} • {scan.stage_name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{new Date(scan.timestamp).toLocaleTimeString()}</div>
                           <button onClick={() => handleRevertScan(scan.id)} className="btn btn-outline" style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', marginTop: '0.25rem', borderColor: '#ef4444', color: '#ef4444' }}>Revert</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </>
        )}

        {/* Absentee Modal */}
        {absenteeModal.open && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
            <div className="panel-card" style={{ width: '100%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserX size={20} color="#ef4444" /> Absentees / Pending</h3>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{absenteeModal.stageName} • {absenteeModal.absentees.length} Participants</div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="text" placeholder="Search ID, name, contact, team..." value={absenteeSearch} onChange={e => setAbsenteeSearch(e.target.value)} className="input-field" style={{ width: '250px' }} />
                  <button onClick={() => setAbsenteeModal({ open: false, stageName: '', stageId: 0, absentees: [] })} className="btn btn-outline">Close</button>
                </div>
              </div>
              <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                {filteredAbsentees.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No participants found</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.5rem' }}>ID</th>
                        <th style={{ padding: '0.5rem' }}>Name</th>
                        <th style={{ padding: '0.5rem' }}>Contact</th>
                        <th style={{ padding: '0.5rem' }}>Team Code</th>
                        <th style={{ padding: '0.5rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAbsentees.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>{a.participant_id}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: '#fff' }}>{a.name}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{a.contact || '-'}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{a.team_code || a.team_name || '-'}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: '#f59e0b', fontSize: '0.8rem' }}>Pending/Absent</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </EdgeLayout>
  );
};
