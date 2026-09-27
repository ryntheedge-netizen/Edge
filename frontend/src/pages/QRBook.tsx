import React, { useEffect, useState, useRef } from 'react';
import { EdgeLayout } from '../components/EdgeLayout';
import { useAuth } from '../context/AuthContext';
import QRCode from 'react-qr-code';
import * as XLSX from 'xlsx';
import { Upload, AlertCircle, FileUp, Download, Undo2, Trash2, Settings, X, Check } from 'lucide-react';
import html2pdf from 'html2pdf.js';

export const QRBookPage: React.FC = () => {
  const { token, logout, hasPermission } = useAuth();
  const [groupedData, setGroupedData] = useState<any>({});
  const [search, setSearch] = useState('');
  
  // Import States
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<any>({ 
    name: '', contact: '', team_name: '', team_code: '',
    event_arthneeti: '', event_finance: '', event_brand: '', event_bull: '', event_ai: '' 
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(0); // 0=none, 1=map, 2=preview, 3=summary
  const [importSummary, setImportSummary] = useState<any>(null);

  // Template States
  const [template, setTemplate] = useState<any>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [box1, setBox1] = useState({ x: 10, y: 10, w: 40, h: 40 });
  const [box2, setBox2] = useState({ x: 10, y: 60, w: 40, h: 10 });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const fetchQRBook = () => {
    fetch('/api/attendance/qr-book', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        if (res.status === 401) { logout(); return; }
        return res.json();
      })
      .then(d => { if (d && d.success) setGroupedData(d.data); })
      .catch(console.error);
  };

  const fetchTemplate = () => {
    fetch('/api/attendance/id-template', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(d => { if (d && d.success) setTemplate(d.template); })
      .catch(console.error);
  };

  useEffect(() => {
    fetchQRBook();
    fetchTemplate();
  }, [token]);

  const handleDownload = () => {
    if (!template) {
      alert("Please upload and configure an ID Template first.");
      return;
    }
    
    setIsGeneratingPdf(true);
    
    // Give react time to render the hidden print container
    setTimeout(() => {
      const container = document.getElementById('pdf-print-container');
      if (!container) {
        setIsGeneratingPdf(false);
        return;
      }
      
      // Calculate exact aspect ratio dynamically based on the first rendered card
      const firstCard = container.firstElementChild as HTMLElement;
      const cardHeight = firstCard ? firstCard.offsetHeight : 1131;
      
      const opt = {
        margin:       0,
        filename:     'EDGE_QR_Book.pdf',
        image:        { type: 'jpeg', quality: 1 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'px', format: [800, cardHeight], orientation: 'portrait' }
      };

      html2pdf().set(opt).from(container).save().then(() => {
        setIsGeneratingPdf(false);
      });
    }, 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (data.length > 0) {
        setColumns(data[0] as string[]);
        const rows = XLSX.utils.sheet_to_json(ws);
        setParsedRows(rows);
        
        const cols = data[0] as string[];
        const m = { ...mapping };
        cols.forEach(c => {
          const lower = c.toLowerCase();
          if (lower.includes('name') && !lower.includes('team')) m.name = c;
          if (lower.includes('phone') || lower.includes('contact') || lower.includes('mobile')) m.contact = c;
          if (lower.includes('team') && !lower.includes('code')) m.team_name = c;
          if (lower.includes('code')) m.team_code = c;
          if (lower.includes('arthneeti')) m.event_arthneeti = c;
          if (lower.includes('finance')) m.event_finance = c;
          if (lower.includes('brand')) m.event_brand = c;
          if (lower.includes('bull')) m.event_bull = c;
          if (lower.includes('ai')) m.event_ai = c;
        });
        setMapping(m);
        setImportStep(1);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleGeneratePreview = async () => {
    const mapped = parsedRows.map(r => ({
      participant_id: r['Participant ID'] || r['participant_id'] || null,
      name: r[mapping.name],
      contact: r[mapping.contact] ? String(r[mapping.contact]) : null,
      team_name: r[mapping.team_name] || null,
      team_code: r[mapping.team_code] || null,
      event_arthneeti: r[mapping.event_arthneeti] || null,
      event_finance: r[mapping.event_finance] || null,
      event_brand: r[mapping.event_brand] || null,
      event_bull: r[mapping.event_bull] || null,
      event_ai: r[mapping.event_ai] || null
    })).filter(r => r.name || r.team_name || r.participant_id); 

    try {
      const res = await fetch('/api/attendance/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: mapped })
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview);
        setImportStep(2);
      } else {
        alert(data.message);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleCommit = async () => {
    if (preview.conflicts.length > 0) {
      if (!confirm("There are unresolved conflicts. Do you want to proceed and ignore the conflicting rows?")) return;
    }
    setIsImporting(true);
    try {
      const res = await fetch('/api/attendance/import-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: [...preview.valid, ...preview.warnings] })
      });
      const data = await res.json();
      if (data.success) {
        setImportSummary(preview.summary);
        setImportStep(3);
        fetchQRBook();
      } else {
        alert("Import failed: " + data.message);
      }
    } catch (err) {
      console.error(err);
    }
    setIsImporting(false);
  };

  const handleUndoImport = async () => {
    if (!confirm("Are you sure you want to revert the most recent Excel import?\n\nThis will delete recently imported participants and restore updated ones to their previous state.")) return;
    try {
      const res = await fetch('/api/attendance/import-undo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert("Import successfully undone.");
        fetchQRBook();
      } else {
        alert("Undo failed: " + (data.error || data.message));
      }
    } catch (err: any) {
      alert("Failed to undo import: " + (err.message || err));
    }
  };

  const handleDeleteParticipant = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?\n\nThis will permanently remove their records, including attendance.`)) return;
    try {
      const res = await fetch(`/api/attendance/participant/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) fetchQRBook();
      else alert("Failed to delete participant: " + data.message);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteTeam = async (id: number, name: string) => {
    if (!confirm(`CRITICAL WARNING: Are you sure you want to delete the entire team "${name}"?\n\nThis will PERMANENTLY delete the team and ALL participants belonging to it.`)) return;
    try {
      const res = await fetch(`/api/attendance/team/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) fetchQRBook();
      else alert("Failed to delete team: " + data.message);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setUploadedImage(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTemplate = async () => {
    if (!uploadedImage) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/attendance/id-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_data: uploadedImage, config_data: { box1, box2 } })
      });
      const data = await res.json();
      if (data.success) {
        alert("Template saved successfully!");
        setIsTemplateModalOpen(false);
        fetchTemplate();
      } else {
        alert("Failed to save template: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving template");
    }
    setIsSavingTemplate(false);
  };

  const filteredData: any = {};
  Object.keys(groupedData).forEach(team => {
    const matched = groupedData[team].participants.filter((p: any) => 
      !search || 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.participant_id.toLowerCase().includes(search.toLowerCase()) || 
      team.toLowerCase().includes(search.toLowerCase())
    );
    if (matched.length > 0) {
      filteredData[team] = {
        team_id: groupedData[team].team_id,
        team_code: groupedData[team].team_code,
        participants: matched
      };
    }
  });

  return (
    <EdgeLayout title="QR Book">
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)' }}>Participant QR Book</h2>
            <div style={{ color: 'var(--text-muted)' }}>Visual directory of all participants. Generate printable ID cards.</div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input type="text" placeholder="Search by name, ID or team..." value={search} onChange={e => setSearch(e.target.value)} className="input-field" style={{ width: '250px' }} />
            {hasPermission('ATTENDANCE_ADMIN') && (
              <button onClick={() => setIsTemplateModalOpen(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={18} /> Configure ID Template
              </button>
            )}
            <button onClick={handleDownload} disabled={isGeneratingPdf || !template} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18} /> {isGeneratingPdf ? 'Generating...' : 'Download QR Book'}
            </button>
          </div>
        </div>
        
        {!template && hasPermission('ATTENDANCE_ADMIN') && (
          <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} />
            You must configure an ID Template before you can download the QR Book.
          </div>
        )}

        {/* Excel Import Section */}
        {hasPermission('ATTENDANCE_ADMIN') && (
          <div className="panel-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileUp size={20} /> Excel Registration Import
              </h3>
              {importStep === 0 && (
                <button onClick={handleUndoImport} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: '#ef4444', color: '#ef4444' }}>
                  <Undo2 size={16} /> Undo Last Import
                </button>
              )}
            </div>
            
            {importStep === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                 <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} style={{ display: 'none' }} id="excel-upload" />
                 <label htmlFor="excel-upload" className="btn btn-outline" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                   <Upload size={16} /> Select Excel File
                 </label>
                 <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Supports .xlsx format</span>
              </div>
            )}

            {importStep === 1 && (
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Map the Excel columns to EDGE fields:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Name *</label>
                    <select value={mapping.name} onChange={e => setMapping({...mapping, name: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Contact Number</label>
                    <select value={mapping.contact} onChange={e => setMapping({...mapping, contact: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Team Name</label>
                    <select value={mapping.team_name} onChange={e => setMapping({...mapping, team_name: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Team Code</label>
                    <select value={mapping.team_code} onChange={e => setMapping({...mapping, team_code: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                </div>
                <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>Event Mapping (Yes/No Columns)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Arthneeti</label>
                    <select value={mapping.event_arthneeti} onChange={e => setMapping({...mapping, event_arthneeti: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Finance Ka Funda</label>
                    <select value={mapping.event_finance} onChange={e => setMapping({...mapping, event_finance: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Brand Bazigaar</label>
                    <select value={mapping.event_brand} onChange={e => setMapping({...mapping, event_brand: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>Bull Ring</label>
                    <select value={mapping.event_bull} onChange={e => setMapping({...mapping, event_bull: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#fff' }}>AI Ki Baat Cheet</label>
                    <select value={mapping.event_ai} onChange={e => setMapping({...mapping, event_ai: e.target.value})} className="input-field"><option value="">Select column...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={handleGeneratePreview} className="btn btn-primary" disabled={!mapping.name}>Generate Preview</button>
                  <button onClick={() => { setImportStep(0); }} className="btn btn-outline">Cancel</button>
                </div>
              </div>
            )}

            {importStep === 2 && preview && (
              <div>
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Participants</span><br/><strong style={{ fontSize: '1.25rem', color: '#fff' }}>{preview.summary.participants}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Teams</span><br/><strong style={{ fontSize: '1.25rem', color: '#fff' }}>{preview.summary.teams}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Valid</span><br/><strong style={{ fontSize: '1.25rem', color: '#10b981' }}>{preview.valid.length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Warnings</span><br/><strong style={{ fontSize: '1.25rem', color: '#f59e0b' }}>{preview.warnings.length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Conflicts</span><br/><strong style={{ fontSize: '1.25rem', color: '#ef4444' }}>{preview.conflicts.length}</strong></div>
                </div>

                <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#fff' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem 1rem' }}>Row</th>
                        <th style={{ padding: '0.5rem 1rem' }}>Participant</th>
                        <th style={{ padding: '0.5rem 1rem' }}>Team</th>
                        <th style={{ padding: '0.5rem 1rem' }}>Events</th>
                        <th style={{ padding: '0.5rem 1rem' }}>QR Status</th>
                        <th style={{ padding: '0.5rem 1rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...preview.valid, ...preview.warnings, ...preview.conflicts].sort((a,b) => a.row_index - b.row_index).map((r: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.5rem 1rem' }}>{r.row_index}</td>
                          <td style={{ padding: '0.5rem 1rem' }}>{r.name || '-'}<br/><span style={{color: '#94a3b8', fontSize: '0.75rem'}}>{r.contact}</span></td>
                          <td style={{ padding: '0.5rem 1rem' }}>{r.resolved_team_name || r.resolved_team_code || '-'}</td>
                          <td style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>{r.events ? r.events.join(', ') : ''}</td>
                          <td style={{ padding: '0.5rem 1rem' }}>{r.qr_action}</td>
                          <td style={{ padding: '0.5rem 1rem', color: r.status === 'Conflict' ? '#ef4444' : r.status === 'Warning' ? '#f59e0b' : '#10b981' }}>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.conflicts.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}><AlertCircle size={16} /> Conflicts Detected</h4>
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                      {preview.conflicts.map((c: any, i: number) => (
                        <div key={i} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#fff' }}>Row {c.row_index} ({c.name || 'Unknown'}):</strong> {c.reasons.join(', ')}
                        </div>
                      ))}
                      <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.5rem', fontStyle: 'italic' }}>These rows will be skipped if you proceed.</div>
                    </div>
                  </div>
                )}
                
                {preview.warnings.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}><AlertCircle size={16} /> Warnings</h4>
                    <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                      {preview.warnings.map((c: any, i: number) => (
                        <div key={i} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#fff' }}>Row {c.row_index} ({c.name || 'Unknown'}):</strong> {c.reasons.join(', ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={handleCommit} disabled={isImporting} className="btn btn-primary" style={{ backgroundColor: '#10b981' }}>{isImporting ? 'Importing...' : 'Commit Data'}</button>
                  <button onClick={() => setImportStep(1)} className="btn btn-outline" disabled={isImporting}>Back to Mapping</button>
                </div>
              </div>
            )}

            {importStep === 3 && importSummary && (
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', padding: '1.5rem' }}>
                <h3 style={{ color: '#10b981', marginTop: 0, marginBottom: '1rem' }}>QR Book Generated</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', color: '#fff' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Participants processed:</span> {importSummary.participants}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Existing QR reused:</span> {importSummary.qrReused}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>New QR generated:</span> {importSummary.qrGenerated}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Invalid QR regenerated:</span> 0</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Conflicts:</span> {preview?.conflicts?.length || 0}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Teams mapped:</span> {importSummary.teams}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Event mappings processed:</span> {importSummary.participants}</div>
                </div>
                <div style={{ marginTop: '1.5rem' }}>
                  <button onClick={() => { setImportStep(0); setImportSummary(null); setPreview(null); }} className="btn btn-primary">Done</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Existing Web View */}
        <div>
          {Object.keys(filteredData).map((teamName) => (
            <div key={teamName} style={{ marginBottom: '3rem' }}>
              <div style={{ 
                backgroundColor: 'var(--bg-panel)', 
                padding: '0.75rem 1.5rem', 
                borderRadius: '8px', 
                marginBottom: '1.5rem', 
                borderLeft: '4px solid #3b82f6',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>
                  {teamName}
                  {filteredData[teamName].team_code && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>[{filteredData[teamName].team_code}]</span>}
                </h3>
                {filteredData[teamName].team_id && hasPermission('ATTENDANCE_ADMIN') && (
                  <button 
                    onClick={() => handleDeleteTeam(filteredData[teamName].team_id, teamName)} 
                    className="btn btn-outline" 
                    style={{ borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    <Trash2 size={14} /> Delete Team
                  </button>
                )}
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'flex-start' }}>
                {filteredData[teamName].participants.map((p: any) => (
                  <div key={p.participant_id} style={{ 
                    width: '280px', 
                    backgroundColor: '#fff', 
                    borderRadius: '12px', 
                    overflow: 'hidden',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <QRCode value={p.participant_id} size={160} level="H" />
                    </div>
                    <div style={{ padding: '1.5rem', backgroundColor: '#fff', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', lineHeight: 1.2 }}>{p.name}</div>
                        {hasPermission('ATTENDANCE_ADMIN') && (
                          <button 
                            onClick={() => handleDeleteParticipant(p.id, p.name)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                            title="Delete Participant"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600, marginBottom: '1rem' }}>{p.participant_id}</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Team:</div>
                        <div style={{ color: '#334155', fontWeight: 500 }}>{filteredData[teamName].team_code || teamName}</div>
                        
                        <div style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Events:</div>
                        <div style={{ color: '#3b82f6', fontWeight: 600 }}>
                          {p.events && p.events.length > 0 ? p.events.join(', ') : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden PDF Generator Container */}
      {template && (
        <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          zIndex: -9999, 
          opacity: isGeneratingPdf ? 1 : 0, 
          pointerEvents: 'none',
          visibility: isGeneratingPdf ? 'visible' : 'hidden'
        }}>
          <div id="pdf-print-container" style={{ width: '800px', backgroundColor: 'transparent' }}>
            {Object.keys(groupedData).map(teamName => 
              groupedData[teamName].participants.map((p: any) => (
                <div key={p.participant_id} style={{
                  position: 'relative',
                  width: '800px',
                  pageBreakAfter: 'always',
                  overflow: 'hidden',
                  lineHeight: 0
                }}>
                  <img src={template.image_data} alt="" style={{ width: '800px', height: 'auto', display: 'block' }} />
                  {/* White Box 1 (Main Info) */}
                  <div style={{
                    position: 'absolute',
                    left: `${template.config_data.box1.x}%`,
                    top: `${template.config_data.box1.y}%`,
                    width: `${template.config_data.box1.w}%`,
                    height: `${template.config_data.box1.h}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    padding: '2%'
                  }}>
                    <QRCode value={p.participant_id} style={{ maxWidth: '60%', maxHeight: '60%', height: 'auto', width: 'auto' }} level="H" />
                    <div style={{ marginTop: '10px', textAlign: 'center', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: p.name.length > 20 ? '18px' : '24px', fontWeight: 'bold', color: '#000', lineHeight: 1.2, wordBreak: 'break-word', maxWidth: '95%' }}>{p.name}</div>
                      <div style={{ fontSize: '16px', color: '#333', fontWeight: 600, marginTop: '4px' }}>{p.participant_id}</div>
                    </div>
                  </div>
                  
                  {/* White Box 2 (Team Name) */}
                  <div style={{
                    position: 'absolute',
                    left: `${template.config_data.box2.x}%`,
                    top: `${template.config_data.box2.y}%`,
                    width: `${template.config_data.box2.w}%`,
                    height: `${template.config_data.box2.h}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    padding: '2%',
                    overflow: 'hidden'
                  }}>
                    <div style={{ fontSize: teamName.length > 25 ? '16px' : '20px', fontWeight: 'bold', color: '#000', textAlign: 'center', wordBreak: 'break-word', width: '100%' }}>
                      {teamName}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Template Modal */}
      {isTemplateModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', width: '900px', maxWidth: '95vw', maxHeight: '95vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>Configure ID Template</h3>
              <button onClick={() => setIsTemplateModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', flexGrow: 1, display: 'flex', gap: '2rem' }}>
              
              {/* Image Preview & Boxes */}
              <div style={{ flex: 2, position: 'relative', border: '1px dashed rgba(255,255,255,0.2)', minHeight: '400px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {!uploadedImage && !template && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <input type="file" accept="image/png, image/jpeg, image/webp" id="template-upload" style={{ display: 'none' }} onChange={handleTemplateUpload} />
                    <label htmlFor="template-upload" className="btn btn-outline" style={{ cursor: 'pointer' }}>Select Image</label>
                  </div>
                )}
                {(uploadedImage || template) && (
                  <div 
                    id="template-editor-container"
                    style={{ position: 'relative', width: '100%', paddingBottom: '158.73%', backgroundImage: `url(${uploadedImage || template.image_data})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
                  >
                    {/* Box 1 Overlay */}
                    <div 
                      onPointerDown={(e) => {
                         e.preventDefault();
                         e.currentTarget.setPointerCapture(e.pointerId);
                         const moveHandler = (ev: PointerEvent) => {
                            const rect = document.getElementById('template-editor-container')?.getBoundingClientRect();
                            if (!rect) return;
                            const dx = (ev.movementX / rect.width) * 100;
                            const dy = (ev.movementY / rect.height) * 100;
                            setBox1(prev => ({...prev, x: Math.max(0, Math.min(100 - prev.w, prev.x + dx)), y: Math.max(0, Math.min(100 - prev.h, prev.y + dy))}));
                         };
                         const upHandler = (ev: PointerEvent) => {
                            const target = ev.target as HTMLElement;
                            target.releasePointerCapture(ev.pointerId);
                            target.removeEventListener('pointermove', moveHandler);
                            target.removeEventListener('pointerup', upHandler);
                         };
                         e.currentTarget.addEventListener('pointermove', moveHandler);
                         e.currentTarget.addEventListener('pointerup', upHandler);
                      }}
                      style={{ position: 'absolute', border: '2px solid #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)', left: `${box1.x}%`, top: `${box1.y}%`, width: `${box1.w}%`, height: `${box1.h}%`, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#3b82f6', fontWeight: 'bold', cursor: 'move', userSelect: 'none', touchAction: 'none' }}
                    >
                      BOX 1 - QR / NAME / ID
                      <div 
                        onPointerDown={(e) => {
                           e.preventDefault();
                           e.stopPropagation();
                           e.currentTarget.setPointerCapture(e.pointerId);
                           const moveHandler = (ev: PointerEvent) => {
                              const rect = document.getElementById('template-editor-container')?.getBoundingClientRect();
                              if (!rect) return;
                              const dx = (ev.movementX / rect.width) * 100;
                              const dy = (ev.movementY / rect.height) * 100;
                              setBox1(prev => ({...prev, w: Math.max(5, Math.min(100 - prev.x, prev.w + dx)), h: Math.max(5, Math.min(100 - prev.y, prev.h + dy))}));
                           };
                           const upHandler = (ev: PointerEvent) => {
                              const target = ev.target as HTMLElement;
                              target.releasePointerCapture(ev.pointerId);
                              target.removeEventListener('pointermove', moveHandler);
                              target.removeEventListener('pointerup', upHandler);
                           };
                           e.currentTarget.addEventListener('pointermove', moveHandler);
                           e.currentTarget.addEventListener('pointerup', upHandler);
                        }}
                        style={{ position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px', backgroundColor: '#3b82f6', cursor: 'se-resize' }} 
                      />
                    </div>
                    {/* Box 2 Overlay */}
                    <div 
                      onPointerDown={(e) => {
                         e.preventDefault();
                         e.currentTarget.setPointerCapture(e.pointerId);
                         const moveHandler = (ev: PointerEvent) => {
                            const rect = document.getElementById('template-editor-container')?.getBoundingClientRect();
                            if (!rect) return;
                            const dx = (ev.movementX / rect.width) * 100;
                            const dy = (ev.movementY / rect.height) * 100;
                            setBox2(prev => ({...prev, x: Math.max(0, Math.min(100 - prev.w, prev.x + dx)), y: Math.max(0, Math.min(100 - prev.h, prev.y + dy))}));
                         };
                         const upHandler = (ev: PointerEvent) => {
                            const target = ev.target as HTMLElement;
                            target.releasePointerCapture(ev.pointerId);
                            target.removeEventListener('pointermove', moveHandler);
                            target.removeEventListener('pointerup', upHandler);
                         };
                         e.currentTarget.addEventListener('pointermove', moveHandler);
                         e.currentTarget.addEventListener('pointerup', upHandler);
                      }}
                      style={{ position: 'absolute', border: '2px solid #10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', left: `${box2.x}%`, top: `${box2.y}%`, width: `${box2.w}%`, height: `${box2.h}%`, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#10b981', fontWeight: 'bold', cursor: 'move', userSelect: 'none', touchAction: 'none' }}
                    >
                      BOX 2 - TEAM NAME
                      <div 
                        onPointerDown={(e) => {
                           e.preventDefault();
                           e.stopPropagation();
                           e.currentTarget.setPointerCapture(e.pointerId);
                           const moveHandler = (ev: PointerEvent) => {
                              const rect = document.getElementById('template-editor-container')?.getBoundingClientRect();
                              if (!rect) return;
                              const dx = (ev.movementX / rect.width) * 100;
                              const dy = (ev.movementY / rect.height) * 100;
                              setBox2(prev => ({...prev, w: Math.max(5, Math.min(100 - prev.x, prev.w + dx)), h: Math.max(5, Math.min(100 - prev.y, prev.h + dy))}));
                           };
                           const upHandler = (ev: PointerEvent) => {
                              const target = ev.target as HTMLElement;
                              target.releasePointerCapture(ev.pointerId);
                              target.removeEventListener('pointermove', moveHandler);
                              target.removeEventListener('pointerup', upHandler);
                           };
                           e.currentTarget.addEventListener('pointermove', moveHandler);
                           e.currentTarget.addEventListener('pointerup', upHandler);
                        }}
                        style={{ position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px', backgroundColor: '#10b981', cursor: 'se-resize' }} 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {(uploadedImage || template) && (
                  <>
                    <div>
                      <input type="file" accept="image/png, image/jpeg, image/webp" id="template-reupload" style={{ display: 'none' }} onChange={handleTemplateUpload} />
                      <label htmlFor="template-reupload" className="btn btn-outline" style={{ width: '100%', textAlign: 'center', cursor: 'pointer' }}>Change Image</label>
                    </div>
                    
                    <div className="panel-card" style={{ padding: '1rem' }}>
                      <h4 style={{ color: '#3b82f6', margin: '0 0 1rem 0' }}>Box 1 (QR, Name, ID)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Left (%)</label><input type="number" className="input-field" value={box1.x} onChange={e=>setBox1({...box1, x: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Top (%)</label><input type="number" className="input-field" value={box1.y} onChange={e=>setBox1({...box1, y: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Width (%)</label><input type="number" className="input-field" value={box1.w} onChange={e=>setBox1({...box1, w: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Height (%)</label><input type="number" className="input-field" value={box1.h} onChange={e=>setBox1({...box1, h: Number(e.target.value)})} /></div>
                      </div>
                    </div>

                    <div className="panel-card" style={{ padding: '1rem' }}>
                      <h4 style={{ color: '#10b981', margin: '0 0 1rem 0' }}>Box 2 (Team Name)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Left (%)</label><input type="number" className="input-field" value={box2.x} onChange={e=>setBox2({...box2, x: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Top (%)</label><input type="number" className="input-field" value={box2.y} onChange={e=>setBox2({...box2, y: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Width (%)</label><input type="number" className="input-field" value={box2.w} onChange={e=>setBox2({...box2, w: Number(e.target.value)})} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#fff' }}>Height (%)</label><input type="number" className="input-field" value={box2.h} onChange={e=>setBox2({...box2, h: Number(e.target.value)})} /></div>
                      </div>
                    </div>

                    <button onClick={handleSaveTemplate} disabled={isSavingTemplate || !uploadedImage} className="btn btn-primary" style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <Check size={18} /> {isSavingTemplate ? 'Saving...' : 'Save Template'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </EdgeLayout>
  );
};
