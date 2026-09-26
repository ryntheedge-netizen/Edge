import React, { useState, useEffect } from 'react';
import { Security } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface TradeEntryFormProps {
  securities: Security[];
  onTradeSubmitted: () => void;
  isMarketLive: boolean;
}

export const TradeEntryForm: React.FC<TradeEntryFormProps> = ({ securities, onTradeSubmitted, isMarketLive }) => {
  const { token } = useAuth();
  const { apiFetch } = useApi();
  const { showError } = useToast();
  const [buyerId, setBuyerId] = useState<string>('');
  const [sellerId, setSellerId] = useState<string>('');
  const [securityId, setSecurityId] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [osStatus, setOsStatus] = useState<string>('OPEN');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  // When securities data arrives (async), auto-select the first one if nothing is selected yet.
  useEffect(() => {
    if (securities.length > 0 && !securityId) {
      setSecurityId(securities[0].id.toString());
    }
  }, [securities]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-calculated total price
  const parsedPrice = parseFloat(price) || 0;
  const parsedQty = parseInt(quantity, 10) || 0;
  const calculatedTotal = parsedPrice * parsedQty;

  const formattedTotal = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(calculatedTotal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const bId = buyerId.trim().toUpperCase();
    const sId = sellerId.trim().toUpperCase();

    if (!bId || !sId) {
      showError('Buyer ID and Seller ID are required');
      return;
    }

    const idRegex = /^[tbj]r\d{2}$/i;
    if (!idRegex.test(bId)) {
      showError('Invalid Buyer ID format. Must be exactly 4 characters (e.g. TR01, JR02).');
      return;
    }
    if (!idRegex.test(sId)) {
      showError('Invalid Seller ID format. Must be exactly 4 characters (e.g. TR01, JR02).');
      return;
    }
    if (bId === sId) {
      showError('Buyer and Seller cannot be the same participant.');
      return;
    }

    const secIdNum = parseInt(securityId, 10);
    if (!secIdNum) {
      showError('Please select a security');
      return;
    }

    if (parsedPrice <= 0) {
      showError('Price must be greater than 0');
      return;
    }

    if (parsedQty <= 0 || parsedQty % 5 !== 0) {
      showError('Quantity must be a positive multiple of 5');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await apiFetch('/api/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyerId: bId,
          sellerId: sId,
          securityId: secIdNum,
          price: parsedPrice,
          quantity: parsedQty,
          osStatus,
          idempotencyKey,
          deskId: sessionStorage.getItem('bull_ring_active_desk')
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Trade could not be recorded. Please try again.');
      }

      setFeedback({
        type: 'success',
        message: data.result?.ltpUpdated
          ? `Trade Recorded! 🚀 Threshold Reached → LTP Updated to ₹${parsedPrice}!`
          : `Trade recorded successfully (Total: ${formattedTotal})`,
      });

      // Clear price and quantity for fast sequential entry
      setPrice('');
      setQuantity('');
      setIdempotencyKey(crypto.randomUUID()); // Regenerate key for the next trade
      onTradeSubmitted();
    } catch (err: any) {
      const msg = err.message || 'Trade could not be recorded. Please try again.';
      setFeedback({ type: 'error', message: msg });
      showError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <span>EXECUTE TRADE ENTRY</span>
      </div>

      {!isMarketLive && (
        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
          Market is currently not LIVE. Start market above to enable trade entry.
        </div>
      )}

      {feedback && (
        <div
          style={{
            backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: feedback.type === 'success' ? '#10b981' : '#ef4444',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <style>
          {`
            .verifier-input {
              border: 2px solid #f59e0b;
              background-color: rgba(245, 158, 11, 0.05);
              transition: all 0.2s ease-in-out;
              font-weight: 600;
              color: #ffffff !important;
            }
            .verifier-input:focus {
              border-color: #d97706;
              background-color: rgba(245, 158, 11, 0.1);
              box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2);
              outline: none;
            }
            .verifier-label {
              font-weight: 700;
              color: #b45309;
            }
            /* Dark mode support if applicable */
            @media (prefers-color-scheme: dark) {
              .verifier-input {
                color: #ffffff !important;
              }
              .verifier-label {
                color: #fbbf24;
              }
            }
          `}
        </style>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label verifier-label">Buyer ID</label>
            <input
              type="text"
              className="form-input font-mono verifier-input"
              placeholder="e.g. TR01"
              value={buyerId}
              onChange={(e) => setBuyerId(e.target.value.toUpperCase())}
              disabled={!isMarketLive || submitting}
              required
              maxLength={4}
            />
          </div>

          <div className="form-group">
            <label className="form-label verifier-label">Seller ID</label>
            <input
              type="text"
              className="form-input font-mono verifier-input"
              placeholder="e.g. TR02"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value.toUpperCase())}
              disabled={!isMarketLive || submitting}
              required
              maxLength={4}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label verifier-label">Security</label>
          <select
            className="form-select font-mono verifier-input"
            value={securityId}
            onChange={(e) => setSecurityId(e.target.value)}
            disabled={!isMarketLive || submitting}
            required
          >
            {securities.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.symbol.toUpperCase()} ({sec.name}) - Current LTP: ₹{sec.current_ltp}
              </option>
            ))}
          </select>
        </div>

        {/* Side field removed as it's implied by Buyer/Seller */}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label verifier-label">Executed Price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input font-mono verifier-input"
              placeholder="e.g. 110"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={!isMarketLive || submitting}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label verifier-label">Quantity</label>
            <input
              type="number"
              step="5"
              min="5"
              className="form-input font-mono verifier-input"
              placeholder="e.g. 1000 (multiples of 5)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!isMarketLive || submitting}
              required
            />
          </div>
        </div>

        {/* Calculated Total Price Display */}
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.85rem 1rem', marginBottom: '1.15rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Calculated Total Price (Price × Quantity)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: calculatedTotal > 0 ? '#10b981' : 'var(--text-muted)', marginTop: '0.2rem' }}>
            {formattedTotal}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label verifier-label">O/S Status</label>
          <select
            className="form-select font-mono verifier-input"
            value={osStatus}
            onChange={(e) => setOsStatus(e.target.value)}
            disabled={!isMarketLive || submitting}
          >
            <option value="OPEN">OPEN</option>
            <option value="SQUARE OFF">SQUARE OFF</option>
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '0.5rem', padding: '0.85rem' }}
          disabled={!isMarketLive || submitting}
        >
          <Send size={18} />
          {submitting ? 'Processing Trade...' : 'Submit Executed Trade'}
        </button>
      </form>
    </div>
  );
};
