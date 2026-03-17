'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MATH_OPS = ['none', 'divide', 'multiply', 'add', 'subtract'];

export default function CostDecoderPage() {
  const toast = useToast();
  const [current, setCurrent] = useState(null);
  const [charMap, setCharMap] = useState({});
  const [mathOp, setMathOp] = useState('none');
  const [mathValue, setMathValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    api.get('/settings/cost-decoder').then(r => {
      if (r.data) {
        setCurrent(r.data);
        const cm = typeof r.data.char_map === 'string' ? JSON.parse(r.data.char_map) : (r.data.char_map || {});
        setCharMap(cm);
        setMathOp(r.data.math_op || 'none');
        setMathValue(r.data.math_value || '');
      }
    });
  }, []);

  function handleCharChange(ch, val) {
    setCharMap(prev => ({ ...prev, [ch]: val }));
  }

  function decodeTest(encoded) {
    let out = '';
    for (const c of encoded.toUpperCase()) out += charMap[c] ?? c;
    let num = parseFloat(out);
    if (isNaN(num)) return 'Invalid';
    const mv = parseFloat(mathValue);
    if (mathOp === 'divide' && mv) num /= mv;
    else if (mathOp === 'multiply' && mv) num *= mv;
    else if (mathOp === 'add' && mv) num += mv;
    else if (mathOp === 'subtract' && mv) num -= mv;
    return num.toFixed(2);
  }

  async function handleSave() {
    const filtered = Object.fromEntries(Object.entries(charMap).filter(([, v]) => v !== ''));
    setSaving(true);
    try {
      await api.post('/settings/cost-decoder', { char_map: filtered, math_op: mathOp, math_value: mathValue ? parseFloat(mathValue) : null });
      toast('Cost decoder saved and historical records re-decoded', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
      <Topbar title="Cost Decoder Formula" backHref="/settings" />
      <div style={{ maxWidth: 700 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
            Map encoded characters (from Busy) to digits, then apply an optional math operation.
          </div>

          {/* Character map */}
          <div className="card-title" style={{ marginBottom: 10 }}>Character Map</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
            {CHARS.map(ch => (
              <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 700, width: 20, color: 'var(--color-primary)' }}>{ch}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <input
                  className="form-input" style={{ width: 50, padding: '4px 6px', textAlign: 'center' }}
                  value={charMap[ch] || ''} onChange={e => handleCharChange(ch, e.target.value)}
                  maxLength={3} placeholder="—"
                />
              </div>
            ))}
          </div>

          {/* Math operation */}
          <div className="card-title" style={{ marginBottom: 10 }}>Math Operation</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {MATH_OPS.map(op => (
              <button key={op} className={`btn btn-sm ${mathOp === op ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMathOp(op)}>{op}</button>
            ))}
          </div>
          {mathOp !== 'none' && (
            <div className="form-group" style={{ maxWidth: 200 }}>
              <label className="form-label">Value</label>
              <input className="form-input" type="number" step="any" value={mathValue} onChange={e => setMathValue(e.target.value)} placeholder="e.g. 10" />
            </div>
          )}

          {/* Test decoder */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20 }}>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label className="form-label">Test Encoded Value</label>
              <input className="form-input" value={testInput} onChange={e => { setTestInput(e.target.value); setTestResult(decodeTest(e.target.value)); }} placeholder="e.g. ABD" />
            </div>
            {testResult && (
              <div style={{ padding: '8px 16px', background: 'var(--color-green-bg)', border: '1px solid #9AE6B4', borderRadius: 8, fontWeight: 700, color: 'var(--color-green)' }}>
                ₹{testResult}
              </div>
            )}
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving & Re-decoding…' : 'Save Formula & Re-decode All'}
          </button>
        </div>

        {current && (
          <div className="card" style={{ background: 'var(--color-bg)' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Current Formula</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Operation: <strong>{current.math_op}</strong>
              {current.math_value && ` × ${current.math_value}`} ·
              Saved: {new Date(current.created_at).toLocaleString('en-IN')}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
