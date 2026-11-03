import { useState } from 'react';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';

export interface FlipbookSettings {
  background?: string;
  soundEnabled?: boolean;
  allowDownload?: boolean;
  brandText?: string;
}

export default function CustomizationDialog({
  flipbook,
  onClose,
  onSaved,
}: {
  flipbook: Flipbook;
  onClose(): void;
  onSaved(): void;
}) {
  const current = (flipbook as unknown as { settings?: FlipbookSettings }).settings || {};
  const [background, setBackground] = useState(current.background || '#18191c');
  const [soundEnabled, setSoundEnabled] = useState(current.soundEnabled ?? true);
  const [allowDownload, setAllowDownload] = useState(current.allowDownload ?? false);
  const [brandText, setBrandText] = useState(current.brandText || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const themes = [
    { name: 'Dark Slate', color: '#18191c' },
    { name: 'Deep Midnight', color: '#0f172a' },
    { name: 'Warm Cream', color: '#fbf9f4' },
    { name: 'Light Gray', color: '#f1f5f9' },
    { name: 'Forest Dark', color: '#14281d' },
  ];

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api(`/flipbooks/${flipbook.id}`, 'PATCH', {
        settings: {
          background,
          soundEnabled,
          allowDownload,
          brandText,
        },
      });
      setMsg('Customization saved!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (e: any) {
      setMsg(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card custom-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Customize Viewer: “{flipbook.title}”</h2>

        <div className="custom-section">
          <label className="field-label">Viewer Background Theme</label>
          <div className="theme-palette">
            {themes.map((t) => (
              <button
                key={t.color}
                type="button"
                className={`theme-chip ${background === t.color ? 'active' : ''}`}
                style={{ background: t.color, color: t.color === '#fbf9f4' || t.color === '#f1f5f9' ? '#333' : '#fff' }}
                onClick={() => setBackground(t.color)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Custom Color:</span>
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              style={{ width: '40px', height: '30px', cursor: 'pointer', border: 'none', background: 'none' }}
            />
            <code style={{ fontSize: '13px' }}>{background}</code>
          </div>
        </div>

        <div className="custom-section">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            <span><b>Page Turn Sound Effect</b> (Realistic paper rustle audio)</span>
          </label>
        </div>

        <div className="custom-section">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
            />
            <span><b>Allow Readers to Download Original PDF</b></span>
          </label>
        </div>

        <div className="custom-section">
          <label className="field">
            <span>Brand / Magazine Watermark Text (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Published by My Company"
              value={brandText}
              onChange={(e) => setBrandText(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button className="link" onClick={onClose}>Cancel</button>
          {msg && <small className="status-saved">{msg}</small>}
        </div>
      </div>
    </div>
  );
}
