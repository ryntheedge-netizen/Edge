import React, { useEffect, useState } from 'react';
import { EdgeLayout } from '../components/EdgeLayout';
import { useAuth } from '../context/AuthContext';
import { FileDown, CalendarX2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export const AttendanceAuditLogPage: React.FC = () => {
  const { token, logout } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAuditLogs = () => {
    setLoading(true);
    fetch('/api/attendance/audit', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        const d = await res.json();
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error(d.error || 'Failed to fetch');
        return d;
      })
      .then(d => {
        if (d.success) setLogs(d.logs);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAuditLogs();
    const interval = setInterval(fetchAuditLogs, 10000);
    return () => clearInterval(interval);
  }, [token, logout]);

  const handleEndDay = async () => {
    if (!confirm('Are you sure you want to End Day?\n\nThis will lock all active stations and prevent further scans for the current day.')) return;
    try {
      const res = await fetch('/api/attendance/end-day', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message);
        fetchAuditLogs();
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to end day');
    }
  };

  const handleExportExcel = () => {
    if (logs.length === 0) {
      alert('No data to export.');
      return;
    }
    const worksheetData = logs.map(log => ({
      Timestamp: new Date(log.timestamp).toLocaleString(),
      'Participant ID': log.participant_id,
      'Participant Name': log.participant_name,
      Contact: log.contact || '-',
      'Team Code': log.team_code || '-',
      'Attendance Category': log.attendance_category,
      'Event Name': log.event_name || '-',
      Day: log.day,
      Station: log.station || '-',
      'Attendance Status': log.attendance_status,
      'Action Type': log.action_type,
      'Marked By': log.marked_by,
      'Audit Remarks': log.audit_remarks
    }));

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Audit");
    XLSX.writeFile(wb, "Attendance_Audit_Log.xlsx");
  };

  return (
    <EdgeLayout title="Attendance Audit Log">
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)' }}>Attendance Audit Log</h2>
            <div style={{ color: 'var(--text-muted)' }}>Detailed tracking of all attendance records and actions.</div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleEndDay} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: '#ef4444', color: '#ef4444' }}>
              <CalendarX2 size={18} /> End Day
            </button>
            <button onClick={handleExportExcel} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981' }}>
              <FileDown size={18} /> Export to Excel
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ color: '#ef4444', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
            Error: {error}
          </div>
        ) : (
          <div className="panel-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
            {loading && logs.length === 0 ? (
               <div style={{ color: 'var(--text-muted)' }}>Loading audit logs...</div>
            ) : logs.length === 0 ? (
               <div style={{ color: 'var(--text-muted)' }}>No logs found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    <th style={{ padding: '0.75rem' }}>Timestamp</th>
                    <th style={{ padding: '0.75rem' }}>Participant ID</th>
                    <th style={{ padding: '0.75rem' }}>Name</th>
                    <th style={{ padding: '0.75rem' }}>Contact</th>
                    <th style={{ padding: '0.75rem' }}>Team</th>
                    <th style={{ padding: '0.75rem' }}>Category</th>
                    <th style={{ padding: '0.75rem' }}>Event</th>
                    <th style={{ padding: '0.75rem' }}>Day</th>
                    <th style={{ padding: '0.75rem' }}>Station</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem' }}>Method</th>
                    <th style={{ padding: '0.75rem' }}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', color: '#fff' }}>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{log.participant_id}</td>
                      <td style={{ padding: '0.75rem' }}>{log.participant_name}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{log.contact || '-'}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{log.team_code || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: log.attendance_category === 'GENERAL' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: log.attendance_category === 'GENERAL' ? '#3b82f6' : '#10b981' }}>
                          {log.attendance_category}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>{log.event_name || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>{log.day}</td>
                      <td style={{ padding: '0.75rem' }}>{log.station || '-'}</td>
                      <td style={{ padding: '0.75rem', color: '#10b981' }}>{log.attendance_status}</td>
                      <td style={{ padding: '0.75rem' }}>{log.action_type}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{log.marked_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </EdgeLayout>
  );
};
