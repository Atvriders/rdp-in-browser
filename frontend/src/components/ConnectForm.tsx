import { useState } from 'react';
import type { ConnectParams } from '../types';
import './ConnectForm.css';

interface Props {
  onConnect: (params: ConnectParams) => void;
}

const DEFAULTS: ConnectParams = {
  host: '',
  port: 3389,
  username: '',
  password: '',
  domain: '',
  width: 1920,
  height: 1080,
  colorDepth: 24,
  security: 'any',
  ignoreCert: true,
  label: '',
};

const SAVED_KEY = 'rdp-saved-connections';

function loadSaved(): ConnectParams[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); }
  catch { return []; }
}
function saveTo(list: ConnectParams[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

export default function ConnectForm({ onConnect }: Props) {
  const [form, setForm]       = useState<ConnectParams>(DEFAULTS);
  const [saved, setSaved]     = useState<ConnectParams[]>(loadSaved);
  const [advanced, setAdvanced] = useState(false);

  const set = (k: keyof ConnectParams, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ConnectForm] submit, host:', form.host);
    if (!form.host.trim()) return;
    const params = { ...form, label: form.label || form.host };
    // Save to recent
    const updated = [params, ...saved.filter(s => s.host !== params.host)].slice(0, 10);
    setSaved(updated); saveTo(updated);
    onConnect(params);
  };

  return (
    <div className="cf-root">
      <div className="cf-logo">🖥️ RDP in Browser</div>

      {saved.length > 0 && (
        <div className="cf-saved">
          <div className="cf-saved-title">Recent connections</div>
          {saved.map((s, i) => (
            <button key={i} className="cf-saved-item" onClick={() => setForm(s)}>
              <span className="cf-saved-icon">🖥️</span>
              <span className="cf-saved-label">{s.label || s.host}</span>
              <span className="cf-saved-host">{s.username}@{s.host}:{s.port}</span>
            </button>
          ))}
        </div>
      )}

      <form className="cf-form" onSubmit={handleSubmit}>
        <div className="cf-section-title">New Connection</div>

        <label className="cf-label">
          Friendly name
          <input className="cf-input" value={form.label ?? ''} placeholder="optional"
            onChange={e => set('label', e.target.value)} />
        </label>

        <div className="cf-row">
          <label className="cf-label cf-flex">
            Host / IP
            <input className="cf-input" required value={form.host}
              placeholder="192.168.1.100"
              onChange={e => set('host', e.target.value)} />
          </label>
          <label className="cf-label cf-port">
            Port
            <input className="cf-input" type="number" value={form.port}
              onChange={e => set('port', parseInt(e.target.value, 10) || 3389)} />
          </label>
        </div>

        <label className="cf-label">
          Username
          <input className="cf-input" value={form.username}
            onChange={e => set('username', e.target.value)} />
        </label>

        <label className="cf-label">
          Password
          <input className="cf-input" type="password" value={form.password}
            onChange={e => set('password', e.target.value)} />
        </label>

        <label className="cf-label">
          Domain <span className="cf-optional">(optional)</span>
          <input className="cf-input" value={form.domain}
            onChange={e => set('domain', e.target.value)} />
        </label>

        <button type="button" className="cf-advanced-toggle"
          onClick={() => setAdvanced(p => !p)}>
          {advanced ? '▲ Hide' : '▼ Show'} advanced options
        </button>

        {advanced && (
          <div className="cf-advanced">
            <div className="cf-row">
              <label className="cf-label cf-flex">
                Width
                <input className="cf-input" type="number" value={form.width}
                  onChange={e => set('width', parseInt(e.target.value, 10))} />
              </label>
              <label className="cf-label cf-flex">
                Height
                <input className="cf-input" type="number" value={form.height}
                  onChange={e => set('height', parseInt(e.target.value, 10))} />
              </label>
            </div>
            <div className="cf-row">
              <label className="cf-label cf-flex">
                Color depth
                <select className="cf-select" value={form.colorDepth}
                  onChange={e => set('colorDepth', parseInt(e.target.value, 10))}>
                  <option value={8}>8-bit</option>
                  <option value={16}>16-bit</option>
                  <option value={24}>24-bit</option>
                  <option value={32}>32-bit</option>
                </select>
              </label>
              <label className="cf-label cf-flex">
                Security
                <select className="cf-select" value={form.security}
                  onChange={e => set('security', e.target.value)}>
                  <option value="any">Any</option>
                  <option value="nla">NLA</option>
                  <option value="tls">TLS</option>
                  <option value="rdp">RDP (classic)</option>
                </select>
              </label>
            </div>
            <label className="cf-checkbox">
              <input type="checkbox" checked={form.ignoreCert}
                onChange={e => set('ignoreCert', e.target.checked)} />
              Ignore certificate errors
            </label>
          </div>
        )}

        <button className="cf-submit" type="submit">Connect →</button>
      </form>
    </div>
  );
}
