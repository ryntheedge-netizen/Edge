import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { EdgeLayout } from '../components/EdgeLayout';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, AlertCircle, Search, Clock, Users, ArrowLeft, Square, Activity } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface Station {
  id: number;
  station_identifier: string;
  name: string;
  stage_name: string;
  stage_type: string;
  activity_name: string | null;
  day: number;
  stage_id: number;
  status: string;
}

interface ScanRecord {
  participantId: string;
  participantName: string;
  teamName: string;
  time: string;
  status: 'success' | 'duplicate' | 'error';
  message?: string;
}

export const AttendanceScannerPage: React.FC = () => {
  const { token, logout } = useAuth();
  const { showError } = useToast();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  
  // Real-time stats
  const [stats, setStats] = useState({ expected: 0, present: 0 });
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  
  // Manual Entry state
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualResult, setManualResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Scanner state
  const [scanResult, setScanResult] = useState<ScanRecord | null>(null);
  const [scannerState, setScannerState] = useState<'IDLE' | 'STARTING' | 'ACTIVE' | 'ERROR'>('IDLE');
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const lastScannedRef = useRef<{ id: string, time: number } | null>(null);
  const isProcessingRef = useRef(false);
  const mountedRef = useRef(true);

  // Sync selectedStation to ref for use in scanner callback
  const selectedStationRef = useRef<Station | null>(null);
  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);
  
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  const fetchStations = () => {
    fetch('/api/attendance/stations', { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (res.status === 401) { logout(); return { stations: [] }; }
        return res.json();
      })
      .then(data => { if (data.stations) setStations(data.stations); })
      .catch(console.error);
  };

  useEffect(() => {
    fetchStations();
    // Auto-refresh stations periodically for status updates
    const intv = setInterval(fetchStations, 10000);
    return () => clearInterval(intv);
  }, [token, logout]);

  // Group stations for hierarchical UI
  const groupedStations = useMemo(() => {
    const general = stations.filter(s => s.stage_type === 'GENERAL').sort((a,b) => a.day - b.day || a.id - b.id);
    const event = stations.filter(s => s.stage_type === 'EVENT');
    const eventGrouped = event.reduce((acc, curr) => {
      const act = curr.activity_name || 'Unknown';
      if (!acc[act]) acc[act] = [];
      acc[act].push(curr);
      acc[act].sort((a,b) => a.day - b.day);
      return acc;
    }, {} as Record<string, Station[]>);
    return { general, eventGrouped };
  }, [stations]);

  // Update selected station if it changes in the background
  useEffect(() => {
    if (selectedStation) {
      const updated = stations.find(s => s.id === selectedStation.id);
      if (updated && updated.status !== selectedStation.status) {
        setSelectedStation(updated);
      }
    }
  }, [stations, selectedStation]);

  const fetchDashboardStats = () => {
    if (!selectedStation) return;
    fetch('/api/attendance/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.stageStats) {
          const st = data.stageStats.find((s: any) => s.id === selectedStation.stage_id);
          if (st) setStats({ expected: st.expected, present: st.present });
        }
      }).catch(console.error);
  };

  useEffect(() => {
    fetchDashboardStats();
    const statIntv = setInterval(fetchDashboardStats, 5000);
    return () => clearInterval(statIntv);
  }, [selectedStation, token]);

  const toggleStationStatus = async (newStatus: 'ACTIVE' | 'STOPPED') => {
    if (!selectedStation) return;
    try {
      const res = await fetch(`/api/attendance/station/${selectedStation.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setSelectedStation({ ...selectedStation, status: newStatus });
        fetchStations();
      }
    } catch(err) {
      console.error(err);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      const instance = scannerRef.current;
      scannerRef.current = null;
      try {
        if (instance.isScanning) {
          cleanupPromiseRef.current = instance.stop();
          await cleanupPromiseRef.current;
        }
        instance.clear();
      } catch (err) {
        console.error("Error stopping scanner", err);
      } finally {
        cleanupPromiseRef.current = null;
      }
    }
    if (mountedRef.current) {
      setScannerState('IDLE');
    }
  };

  const startScanner = async () => {
    if (scannerState === 'STARTING' || scannerState === 'ACTIVE') return;
    setScannerState('STARTING');
    setScannerError(null);
    
    if (cleanupPromiseRef.current) {
      await cleanupPromiseRef.current;
    }
    
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader");
      }
      
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const now = Date.now();
          if (lastScannedRef.current && lastScannedRef.current.id === decodedText && (now - lastScannedRef.current.time) < 4000) {
            return;
          }
          if (isProcessingRef.current) return;

          lastScannedRef.current = { id: decodedText, time: now };
          isProcessingRef.current = true;
          
          processScan(decodedText, 'QR').finally(() => {
            isProcessingRef.current = false;
          });
        },
        () => {} // Ignore frame errors
      );
      
      if (mountedRef.current) {
        setScannerState('ACTIVE');
      }
    } catch (err: any) {
      console.error("Camera Initialization Error:", err);
      if (scannerRef.current) {
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      if (mountedRef.current) {
        const errorMsg = typeof err === 'string' ? err : err.message || 'Unknown camera error';
        
        let friendlyMsg = "Could not start camera.";
        if (errorMsg.includes('NotReadableError') || errorMsg.includes('track')) {
          friendlyMsg = "Camera is already in use by another application or tab. Please close other camera apps and retry.";
        } else if (errorMsg.includes('NotAllowedError') || errorMsg.includes('Permission')) {
          friendlyMsg = "Camera access was denied. Please grant permission in your browser settings.";
        } else if (errorMsg.includes('NotFoundError')) {
          friendlyMsg = "No camera device found on this device.";
        }
        
        setScannerError(`${friendlyMsg} (${errorMsg})`);
        setScannerState('ERROR');
      }
    }
  };

  // Stop scanner automatically when switching modes or station stops
  useEffect(() => {
    if (!selectedStation || manualMode || selectedStation.status !== 'ACTIVE') {
      stopScanner();
    }
  }, [selectedStation, manualMode]);

  const processScan = async (participantId: string, method: 'QR' | 'MANUAL') => {
    const station = selectedStationRef.current;
    if (!station) return;
    if (station.status !== 'ACTIVE') {
       const msg = 'Scanning is currently stopped for this station.';
       setScanResult({ status: 'error', participantId, participantName: 'Station Stopped', teamName: '-', time: new Date().toLocaleTimeString(), message: msg });
       showError(msg);
       setTimeout(() => { if (mountedRef.current) setScanResult(null); }, 3000);
       return;
    }

    try {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ participant_id: participantId, station_id: station.id, method })
      });
      if (res.status === 401) { logout(); return; }
      
      const data = await res.json();
      const time = new Date().toLocaleTimeString();
      let newRecord: ScanRecord;

      if (data.success) {
        newRecord = { status: 'success', participantId, participantName: data.data.participantName, teamName: data.data.teamName, time };
        setStats(prev => ({ ...prev, present: prev.present + 1 }));
        setLastScanTime(time);
      } else if (data.message.includes('Already marked present')) {
        newRecord = { status: 'duplicate', participantId, participantName: 'Already Scanned', teamName: '-', time, message: data.message };
        showError(data.message);
      } else {
        newRecord = { status: 'error', participantId, participantName: 'Error', teamName: '-', time, message: data.message };
        showError(data.message);
      }

      setScanResult(newRecord);
      setRecentScans(prev => [newRecord, ...prev].slice(0, 10));
      
      if (method === 'MANUAL') {
        setManualMode(false);
        setManualId('');
        setManualResult(null);
        setShowConfirm(false);
      }

      setTimeout(() => setScanResult(null), 3000);

    } catch (err) {
      const msg = 'Failed to connect to server';
      setScanResult({ status: 'error', participantId, participantName: 'Network Error', teamName: '-', time: new Date().toLocaleTimeString(), message: msg });
      showError(msg);
      setTimeout(() => { if (mountedRef.current) setScanResult(null); }, 3000);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/attendance/participant/${manualId.trim()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setManualResult(res.ok ? data : { error: data.error });
      setShowConfirm(false);
    } catch (err) {
      setManualResult({ error: 'Failed to lookup participant' });
      showError('Failed to lookup participant');
    } finally {
      setIsSearching(false);
    }
  };

  if (!selectedStation) {
    return (
      <EdgeLayout title="Attendance Scanner">
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ color: '#fff', marginBottom: '2rem', fontFamily: 'var(--font-heading)' }}>Select Operations Station</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {/* General Section */}
            <div className="panel-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ color: '#3b82f6', marginBottom: '1rem', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '0.5rem' }}>GENERAL</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {groupedStations.general.map(st => (
                  <button key={st.id} onClick={() => setSelectedStation(st)} className="btn btn-outline" style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{st.stage_name}</span>
                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: st.status === 'ACTIVE' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)', color: st.status === 'ACTIVE' ? '#10b981' : '#ccc' }}>{st.status}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Event Section */}
            <div className="panel-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ color: '#8b5cf6', marginBottom: '1rem', borderBottom: '1px solid rgba(139, 92, 246, 0.2)', paddingBottom: '0.5rem' }}>EVENT</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {Object.entries(groupedStations.eventGrouped).map(([act, stList]) => (
                  <div key={act}>
                    <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '0.5rem' }}>{act}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {stList.map(st => (
                        <button key={st.id} onClick={() => setSelectedStation(st)} className="btn btn-outline" style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Day {st.day}</span>
                          <span style={{ fontSize: '0.65rem', color: st.status === 'ACTIVE' ? '#10b981' : 'var(--text-muted)' }}>{st.status === 'ACTIVE' ? '●' : '○'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </EdgeLayout>
    );
  }

  const attendancePct = stats.expected > 0 ? ((stats.present / stats.expected) * 100).toFixed(1) : 0;
  const pending = Math.max(0, stats.expected - stats.present);
  const isActive = selectedStation.status === 'ACTIVE';

  return (
    <EdgeLayout title={`Scanner: ${selectedStation.stage_name}`}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button onClick={() => { setSelectedStation(null); setRecentScans([]); setManualMode(false); }} className="btn btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
            <ArrowLeft size={14} /> Change Station
          </button>
          <h2 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {selectedStation.activity_name ? `${selectedStation.activity_name} — Day ${selectedStation.day}` : selectedStation.stage_name}
          </h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Station: {selectedStation.name}</div>
        </div>
        
        {/* Station Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', color: isActive ? '#10b981' : '#ef4444' }}>
            {isActive ? <><Activity size={18} /> ACTIVE</> : <><Square size={18} /> STOPPED</>}
          </div>
          <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
          {isActive ? (
             <button onClick={() => toggleStationStatus('STOPPED')} className="btn btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>Stop Station</button>
          ) : (
             <button onClick={() => toggleStationStatus('ACTIVE')} className="btn btn-outline" style={{ borderColor: '#10b981', color: '#10b981', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>Start Station</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        
        {/* LEFT COLUMN: CAMERA / SCANNER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {scanResult && (
            <div style={{
              padding: '1rem', borderRadius: '8px',
              backgroundColor: scanResult.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : scanResult.status === 'duplicate' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${scanResult.status === 'success' ? '#10b981' : scanResult.status === 'duplicate' ? '#f59e0b' : '#ef4444'}`,
              display: 'flex', alignItems: 'center', gap: '1rem', color: '#fff',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              {scanResult.status === 'success' && <CheckCircle color="#10b981" size={32} />}
              {scanResult.status === 'duplicate' && <AlertCircle color="#f59e0b" size={32} />}
              {scanResult.status === 'error' && <XCircle color="#ef4444" size={32} />}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{scanResult.status === 'success' ? 'ATTENDANCE RECORDED' : scanResult.status === 'duplicate' ? 'ALREADY PRESENT' : 'NOT RECORDED'}</div>
                <div style={{ fontSize: '1rem', marginTop: '0.25rem' }}>{scanResult.participantName}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                  {scanResult.participantId} {scanResult.message ? `— ${scanResult.message}` : ''}
                </div>
              </div>
            </div>
          )}

          <div className="panel-card" style={{ padding: '1rem', position: 'relative', border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
            {!isActive ? (
               <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                 <Square size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                 <h3 style={{ color: '#fff', margin: '0 0 0.5rem 0' }}>STATION STOPPED</h3>
                 <p style={{ color: 'var(--text-muted)' }}>Attendance scanning is currently stopped for this station.</p>
               </div>
            ) : !manualMode ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={18} color="#10b981" /> SCAN QR</h3>
                  <button onClick={() => setManualMode(true)} className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}>Enter Participant ID</button>
                </div>
                
                {scannerState === 'IDLE' && (
                  <div style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Click below to initialize the camera and begin scanning.</p>
                    <button onClick={startScanner} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>Start Scanning</button>
                  </div>
                )}
                
                {scannerState === 'STARTING' && (
                  <div style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                    Initializing camera... Please allow permissions if prompted.
                  </div>
                )}
                
                {scannerState === 'ERROR' && (
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                    <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '1rem' }} />
                    <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem 0' }}>Camera Error</h4>
                    <p style={{ color: '#ffb3b3', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{scannerError}</p>
                    <button onClick={startScanner} className="btn btn-primary" style={{ backgroundColor: '#ef4444' }}>Retry Camera</button>
                  </div>
                )}

                <div id="qr-reader" style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000', display: (scannerState === 'ACTIVE' || scannerState === 'STARTING') ? 'block' : 'none' }}></div>
                
                {scannerState === 'ACTIVE' && (
                  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button onClick={stopScanner} className="btn btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '0.4rem 1rem', fontSize: '0.8rem' }}>Stop Camera</button>
                  </div>
                )}
              </>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#fff' }}>Manual Attendance</h3>
                  <button onClick={() => { setManualMode(false); setManualResult(null); setShowConfirm(false); }} className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}>Back to Scanner</button>
                </div>
                
                <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <input type="text" value={manualId} onChange={e => setManualId(e.target.value.toUpperCase())} placeholder="e.g. EDG26-001" className="input-field" style={{ flex: 1 }} />
                  <button type="submit" className="btn btn-primary" disabled={isSearching}><Search size={18} /></button>
                </form>

                {manualResult && !manualResult.error && !showConfirm && (
                  <div style={{ padding: '1.25rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{manualResult.participant.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                      {manualResult.participant.participant_id} <br/> 
                      Team: {manualResult.participant.team_code || manualResult.participant.team_name || 'No Team'} <br/>
                      Contact: {manualResult.participant.contact || 'N/A'}
                    </div>
                    
                    <div style={{ fontSize: '0.85rem', color: '#8b5cf6', marginBottom: '1.5rem' }}>
                      <strong>Assigned Events:</strong> {manualResult.participations.length > 0 ? manualResult.participations.map((p:any)=>p.name).join(', ') : 'None'}
                    </div>

                    <button onClick={() => setShowConfirm(true)} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontWeight: 'bold' }}>
                      Mark Present
                    </button>
                  </div>
                )}

                {manualResult && !manualResult.error && showConfirm && (
                  <div style={{ padding: '1.25rem', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <h3 style={{ color: '#fff', margin: '0 0 1rem 0' }}>Confirm Attendance</h3>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Participant: <strong style={{ color: '#fff' }}>{manualResult.participant.name}</strong><br/>
                      ID: <strong style={{ color: '#fff' }}>{manualResult.participant.participant_id}</strong><br/>
                      Team: <strong style={{ color: '#fff' }}>{manualResult.participant.team_code || '-'}</strong><br/>
                      Stage: <strong style={{ color: '#fff' }}>{selectedStation.activity_name ? `${selectedStation.activity_name} - Day ${selectedStation.day}` : selectedStation.stage_name}</strong><br/>
                      Method: <strong style={{ color: '#fff' }}>Manual</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={() => setShowConfirm(false)} className="btn btn-outline" style={{ flex: 1 }}>Cancel</button>
                      <button onClick={() => processScan(manualResult.participant.participant_id, 'MANUAL')} className="btn btn-primary" style={{ flex: 1, backgroundColor: '#10b981' }}>Confirm Attendance</button>
                    </div>
                  </div>
                )}

                {manualResult?.error && (
                  <div style={{ color: '#ef4444', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={18} /> {manualResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: STATS & RECENT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="panel-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
               <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <Users size={18} /> Live Statistics
               </h3>
               {lastScanTime && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last Scan: {lastScanTime}</div>}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Expected</div>
                <div style={{ fontSize: '2rem', color: '#fff', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>{stats.expected}</div>
              </div>
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 600 }}>Present</div>
                <div style={{ fontSize: '2rem', color: '#10b981', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>{stats.present}</div>
              </div>
              <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600 }}>Pending</div>
                <div style={{ fontSize: '2rem', color: '#f59e0b', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>{pending}</div>
              </div>
              <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: '#3b82f6', textTransform: 'uppercase', fontWeight: 600 }}>Attendance</div>
                <div style={{ fontSize: '2rem', color: '#3b82f6', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>{attendancePct}%</div>
              </div>
            </div>
          </div>

          <div className="panel-card" style={{ padding: '1.5rem', flex: 1, minHeight: '300px' }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} /> Recent Scans
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentScans.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>No recent scans</div>
              ) : (
                recentScans.map((rs, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: i === recentScans.length -1 ? 'none' : '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {rs.status === 'success' ? <CheckCircle color="#10b981" size={18} /> : rs.status === 'duplicate' ? <AlertCircle color="#f59e0b" size={18} /> : <XCircle color="#ef4444" size={18} />}
                      <div>
                        <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>{rs.participantName}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{rs.participantId} • {rs.time}</div>
                      </div>
                    </div>
                    <div style={{ color: rs.status === 'success' ? '#10b981' : rs.status === 'duplicate' ? '#f59e0b' : '#ef4444', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {rs.status === 'success' ? 'Recorded' : rs.status === 'duplicate' ? 'Duplicate' : 'Error'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </EdgeLayout>
  );
};
