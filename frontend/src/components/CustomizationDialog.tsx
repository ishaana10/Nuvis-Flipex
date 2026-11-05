import { useState } from 'react';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';

export interface FlipbookSettings {
  background?: string;
  defaultReadingMode?: 'flip' | 'scroll' | 'reader';
  soundEnabled?: boolean;
  allowDownload?: boolean;
  brandText?: string;
  companyName?: string;
  catalogueSubtitle?: string;
  disclaimerTitle?: string;
  disclaimerText?: string;
  showDisclaimer?: boolean;
  showPoweredBy?: boolean;
}

const DEFAULT_DISCLAIMER = `This e-book catalogue is for informational purposes only. While we strive to provide accurate and up-to-date information, we make no guarantees about the completeness, accuracy, or reliability of the content. All products, pricing, and availability are subject to change without prior notice.

We are not responsible for any loss or damage that may result from the use of or reliance on the information in this e-book.

By accessing and using this e-book, you acknowledge and accept these terms.`;

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
  const [background, setBackground] = useState(current.background || '#ffffff');
  const [defaultReadingMode, setDefaultReadingMode] = useState<'flip' | 'scroll' | 'reader'>(
    current.defaultReadingMode || 'flip'
  );
  const [soundEnabled, setSoundEnabled] = useState(current.soundEnabled ?? true);
  const [allowDownload, setAllowDownload] = useState(current.allowDownload ?? false);
  const [brandText, setBrandText] = useState(current.brandText || '');
  const [companyName, setCompanyName] = useState(current.companyName || '');
  const [catalogueSubtitle, setCatalogueSubtitle] = useState(current.catalogueSubtitle || flipbook.title || 'CATALOGUE');
  const [disclaimerTitle, setDisclaimerTitle] = useState(current.disclaimerTitle || 'Disclaimer');
  const [disclaimerText, setDisclaimerText] = useState(
    current.disclaimerText !== undefined ? current.disclaimerText : DEFAULT_DISCLAIMER
  );
  const [showDisclaimer, setShowDisclaimer] = useState(current.showDisclaimer ?? true);
  const [showPoweredBy, setShowPoweredBy] = useState(current.showPoweredBy ?? true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const themes = [
    { name: 'Clean White', color: '#ffffff' },
    { name: 'Light Gray', color: '#f1f5f9' },
    { name: 'Warm Cream', color: '#fbf9f4' },
    { name: 'Dark Slate', color: '#18191c' },
    { name: 'Deep Midnight', color: '#0f172a' },
    { name: 'Forest Dark', color: '#14281d' },
  ];

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api(`/flipbooks/${flipbook.id}`, 'PATCH', {
        settings: {
          ...current,
          background,
          defaultReadingMode,
          soundEnabled,
          allowDownload,
          brandText,
          companyName,
          catalogueSubtitle,
          disclaimerTitle,
          disclaimerText,
          showDisclaimer,
          showPoweredBy,
        },
      });
      setMsg('Customization saved!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    } catch (e: any) {
      setMsg(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="card custom-modal"
        style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Customize Viewer: “{flipbook.title}”</h2>
          <button type="button" className="link" onClick={onClose}>✕ Close</button>
        </div>

        <div className="custom-section">
          <label className="field-label">Viewer Background Theme</label>
          <div className="theme-palette">
            {themes.map((t) => (
              <button
                key={t.color}
                type="button"
                className={`theme-chip ${background === t.color ? 'active' : ''}`}
                style={{
                  background: t.color,
                  color: ['#ffffff', '#fbf9f4', '#f1f5f9'].includes(t.color) ? '#0f172a' : '#fff',
                  border: background === t.color ? '2px solid #0284c7' : '1px solid #cbd5e1',
                }}
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

        {/* Left-Side Cover Disclaimer & Company Info (Heyzine Style) */}
        <div className="custom-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Left-Side Company Title & Disclaimer Block
            </label>
            <label className="toggle-label" style={{ fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={showDisclaimer}
                onChange={(e) => setShowDisclaimer(e.target.checked)}
              />
              <span>Show on Reader Stage</span>
            </label>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#64748b' }}>
            Displayed on the top-left of the viewer when on the Front Cover, and becomes semi-transparent when pages are flipped.
          </p>

          {showDisclaimer && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Company / Tenant Heading</span>
                  <input
                    type="text"
                    placeholder="e.g. MANNAT INVESTMENTS PTE LTD"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Publication Subtitle</span>
                  <input
                    type="text"
                    placeholder="e.g. CATALOGUE"
                    value={catalogueSubtitle}
                    onChange={(e) => setCatalogueSubtitle(e.target.value)}
                  />
                </label>
              </div>

              <label className="field" style={{ marginBottom: 0 }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Disclaimer Heading</span>
                <input
                  type="text"
                  placeholder="Disclaimer"
                  value={disclaimerTitle}
                  onChange={(e) => setDisclaimerTitle(e.target.value)}
                />
              </label>

              <label className="field" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Disclaimer Text</span>
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: '11px' }}
                    onClick={() => setDisclaimerText(DEFAULT_DISCLAIMER)}
                  >
                    Insert Standard Catalogue Disclaimer
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={disclaimerText}
                  onChange={(e) => setDisclaimerText(e.target.value)}
                  placeholder="Enter legal disclaimer or reader notice..."
                  style={{ fontSize: '12px', lineHeight: 1.45 }}
                />
              </label>
            </div>
          )}
        </div>

        <div className="custom-section">
          <label className="field-label">Default Reading Experience Mode</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'flip', label: '📖 3D Page-Turn Flipbook' },
              { id: 'scroll', label: '📜 Vertical Continuous Scroll' },
              { id: 'reader', label: '♿ Accessible Screen-Reader' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDefaultReadingMode(m.id as 'flip' | 'scroll' | 'reader')}
                className={`theme-chip ${defaultReadingMode === m.id ? 'active' : ''}`}
                style={{
                  background: defaultReadingMode === m.id ? '#0284c7' : '#f1f5f9',
                  color: defaultReadingMode === m.id ? '#ffffff' : '#334155',
                  fontWeight: 600,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="custom-section" style={{ display: 'grid', gap: '8px' }}>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showPoweredBy}
              onChange={(e) => setShowPoweredBy(e.target.checked)}
            />
            <span><b>Show Bottom-Left “Powered by Nuvis Flipex” Logo Badge</b></span>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            <span><b>Page Turn Sound Effect</b> (Realistic paper rustle audio)</span>
          </label>
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
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Header Brand / Watermark Text (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Nuvis Flipex"
              value={brandText}
              onChange={(e) => setBrandText(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
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
