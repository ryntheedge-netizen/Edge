import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Users, Save, ChevronDown, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Security } from '../../types';

interface JobberControlsProps {
  securities: Security[];
}

export const JobberControls: React.FC<JobberControlsProps> = ({ securities }) => {
  const { token, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [jobbers, setJobbers] = useState<any[]>([]);
  const [count, setCount] = useState<string>('2');
  const [loading, setLoading] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchJobbers = async () => {
    try {
      const res = await apiFetch('/api/jobbers');
      if (res.ok) {
        const data = await res.json();
        setJobbers(data);
        setCount(data.length.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token && hasPermission('BULL_RING_SUPERADMIN')) {
      fetchJobbers();
    }
  }, [token, hasPermission]);

  if (!hasPermission('BULL_RING_SUPERADMIN')) return null;

  const handleUpdateCount = async () => {
    const parsed = parseInt(count);
    if (isNaN(parsed) || parsed < 0) return;
    
    setLoading(true);
    try {
      const res = await apiFetch('/api/jobbers/count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parsed }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFeedback({ type: 'success', message: 'Jobber count updated' });
      fetchJobbers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="panel-card" style={{ marginTop: '1.5rem' }}>
      <div className="panel-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#c4b5fd', fontSize: '1.1rem', fontWeight: 'bold' }}>
          <Users size={18} />
          <span>JOBBER CONTROLS</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 500 }}>
          Manage jobber count, assigned securities and inventory
        </span>
      </div>

      <div style={{ padding: '1rem' }}>
        <div style={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '1rem' }}>
            JOBBER CONFIGURATION
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Number of Jobbers
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  type="number"
                  style={{ width: '100px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.6rem 0.75rem', borderRadius: '4px', outline: 'none' }}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={loading}
                  min="0"
                />
                <button 
                  onClick={handleUpdateCount} 
                  disabled={loading}
                  style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '0.6rem 1.25rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, transition: 'all 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)'}
                >
                  <Save size={16} /> Update Count
                </button>
              </div>
            </div>
            
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
              Configure how many jobbers are available in the market.
            </div>
          </div>
          
          {feedback && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: feedback.type === 'success' ? '#10b981' : '#ef4444', marginTop: '1rem', fontSize: '0.85rem' }}>
              {feedback.type === 'success' ? <CheckCircle2 size={14} /> : null}
              {feedback.message}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {jobbers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem' }}>No jobbers configured.</div>
          ) : (
            jobbers.map(jobber => (
              <div key={jobber.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--bg-panel)' }}>
                <div 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', cursor: 'pointer', backgroundColor: expanded.has(jobber.id) ? 'rgba(139, 92, 246, 0.05)' : 'transparent', transition: 'background-color 0.2s' }}
                  onClick={() => toggleExpand(jobber.id)}
                  onMouseOver={(e) => { if (!expanded.has(jobber.id)) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)' }}
                  onMouseOut={(e) => { if (!expanded.has(jobber.id)) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expanded.has(jobber.id) ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                      <ChevronDown size={18} />
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>{jobber.jobber_identifier}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {jobber.inventory?.length || 0} Securities
                  </div>
                </div>
                
                {expanded.has(jobber.id) && (
                  <div style={{ borderTop: '1px solid var(--border-color)' }}>
                    <JobberInventoryEditor jobber={jobber} securities={securities} onUpdate={fetchJobbers} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const JobberInventoryEditor: React.FC<{ jobber: any, securities: Security[], onUpdate: () => void }> = ({ jobber, securities, onUpdate }) => {
  const { apiFetch } = useApi();
  const [items, setItems] = useState<any[]>(jobber.inventory || []);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const addItem = () => {
    if (securities.length === 0) return;
    setItems([...items, { security_id: securities[0].id, quantity: 10000, assigned_price: securities[0].current_ltp }]);
  };
  
  const removeItem = (idx: number) => {
    const next = [...items];
    next.splice(idx, 1);
    setItems(next);
  };
  
  const updateItem = (idx: number, field: string, val: string | number) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: Number(val) };
    setItems(next);
  };
  
  const save = async () => {
    setSaving(true);
    setSaveFeedback(null);
    try {
      const payload = items.map(i => ({ security_id: i.security_id, quantity: i.quantity, price: i.assigned_price }));
      const res = await apiFetch(`/api/jobbers/${jobber.id}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaveFeedback({ type: 'success', message: 'Inventory saved successfully' });
      onUpdate();
    } catch (err: any) {
      console.error(err);
      setSaveFeedback({ type: 'error', message: err.message || 'Failed to save inventory' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  const totalValue = jobber.inventory?.reduce((sum: number, inv: any) => sum + (inv.remaining_quantity * inv.assigned_price), 0) || 0;
  const totalUnits = jobber.inventory?.reduce((sum: number, inv: any) => sum + inv.remaining_quantity, 0) || 0;
  const formattedTotalValue = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalValue);
  
  return (
    <div style={{ padding: '1.25rem' }}>
      
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '1rem' }}>
          INVENTORY CONFIGURATION
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-dark)', borderRadius: '6px', border: '1px dashed var(--border-color)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>No securities assigned</p>
            <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.8rem' }}>Add a security to configure this jobber's inventory.</p>
            <button 
              onClick={addItem}
              style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '0.6rem 1.25rem', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}
            >
              <Plus size={14} /> Add Security
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: '400px', display: 'grid', gridTemplateColumns: '3fr 1.5fr 1.5fr 1fr', gap: '1rem', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Security</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Price</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quantity</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Action</div>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ minWidth: '400px', display: 'grid', gridTemplateColumns: '3fr 1.5fr 1.5fr 1fr', gap: '1rem', alignItems: 'center', backgroundColor: 'var(--bg-dark)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                  <select 
                    style={{ width: '100%', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.6rem 0.5rem', borderRadius: '4px', outline: 'none', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }} 
                    value={item.security_id} 
                    onChange={(e) => updateItem(idx, 'security_id', e.target.value)}
                  >
                    {securities.map(s => <option key={s.id} value={s.id}>{s.symbol.toUpperCase()}</option>)}
                  </select>
                  
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>₹</span>
                    <input 
                      type="number" 
                      style={{ width: '100%', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.6rem 0.5rem 0.6rem 1.5rem', borderRadius: '4px', outline: 'none', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }} 
                      placeholder="0" 
                      value={item.assigned_price} 
                      onChange={(e) => updateItem(idx, 'assigned_price', e.target.value)} 
                    />
                  </div>
                  
                  <input 
                    type="number" 
                    style={{ width: '100%', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.6rem 0.5rem', borderRadius: '4px', outline: 'none', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }} 
                    placeholder="0" 
                    value={item.quantity} 
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)} 
                  />
                  
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button 
                      title="Remove security"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }} 
                      onClick={() => removeItem(idx)}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={addItem}
                  style={{ backgroundColor: 'transparent', color: '#a78bfa', border: '1px dashed #a78bfa', padding: '0.6rem 1.25rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(167, 139, 250, 0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Plus size={14} /> Add Security
                </button>
                
                <button 
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to clear the current active configuration? This will reset the live portfolio for this Jobber.')) {
                      setItems([]);
                      setSaving(true);
                      try {
                        const res = await apiFetch(`/api/jobbers/${jobber.id}/inventory`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ items: [] }),
                        });
                        if (!res.ok) throw new Error((await res.json()).error);
                        onUpdate();
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setSaving(false);
                      }
                    }
                  }}
                  style={{ backgroundColor: 'transparent', color: '#ef4444', border: '1px dashed #ef4444', padding: '0.6rem 1.25rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Trash2 size={14} /> Clear
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {saveFeedback && (
                  <span style={{ fontSize: '0.85rem', color: saveFeedback.type === 'success' ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {saveFeedback.type === 'success' ? <CheckCircle2 size={14} /> : null}
                    {saveFeedback.message}
                  </span>
                )}
                <button 
                  onClick={save} 
                  disabled={saving}
                  style={{ backgroundColor: '#8b5cf6', color: '#fff', border: 'none', padding: '0.7rem 1.75rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s', opacity: saving ? 0.7 : 1 }}
                  onMouseOver={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#7c3aed' }}
                  onMouseOut={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#8b5cf6' }}
                >
                  <Save size={16} /> {saving ? 'Saving...' : 'Save Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          CURRENT PORTFOLIO
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
            {formattedTotalValue}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {jobber.inventory?.length || 0} Securities &middot; {totalUnits.toLocaleString()} Total Units
          </div>
        </div>

        {jobber.inventory?.length > 0 && (
          <div style={{ backgroundColor: 'var(--bg-dark)', borderRadius: '6px', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '400px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Security</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Price</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Qty</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {jobber.inventory.map((inv: any, i: number) => {
                  const total = inv.remaining_quantity * inv.assigned_price;
                  return (
                    <tr key={i} style={{ borderBottom: i < jobber.inventory.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: '#e2e8f0' }}>{inv.security_symbol.toUpperCase()}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>₹{inv.assigned_price.toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{inv.remaining_quantity.toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>₹{total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
