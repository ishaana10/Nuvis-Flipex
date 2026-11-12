import { useState, type ChangeEvent } from 'react';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';

export type PageEffectType =
  | 'magazine'
  | 'book'
  | 'album'
  | 'notebook'
  | 'slider'
  | 'cards'
  | 'coverflow'
  | 'one_page';

export interface FlipbookSettings {
  // Title & Background Info (Pic 1)
  companyName?: string;
  catalogueSubtitle?: string;
  disclaimerTitle?: string;
  disclaimerText?: string;
  showDisclaimer?: boolean;
  privateNotes?: string;

  // Page Effect (Pic 2 & Pic 3)
  pageEffect?: PageEffectType;
  soundEnabled?: boolean;
  horizontalTurn?: boolean;
  rightToLeft?: boolean;
  defaultReadingMode?: 'flip' | 'scroll' | 'reader';

  // Background (Pic 4)
  background?: string;
  backgroundType?: 'image' | 'color' | 'style';
  backgroundImage?: string;
  backgroundStyle?: string;

  // Logo & Controls
  showPoweredBy?: boolean;
  customLogoUrl?: string;
  brandText?: string;
  allowDownload?: boolean;
  showToolbar?: boolean;
  showThumbnailsButton?: boolean;
  showSearchButton?: boolean;
  showShareButton?: boolean;
  showFullscreenButton?: boolean;

  // Background Audio
  bgAudioUrl?: string;
  bgAudioAutoplay?: boolean;
  bgAudioLoop?: boolean;
}

export const PRESET_BACKGROUNDS: Array<{ id: string; name: string; css: string }> = [
  {
    id: 'sunset_mesh',
    name: 'Warm Bronze Blur',
    css: 'radial-gradient(circle at 15% 25%, #f1f5f9 0%, #a88b7d 45%, #5b1d1b 100%)',
  },
  {
    id: 'halftone_dots',
    name: 'Halftone Dots',
    css: 'radial-gradient(#0284c7 1.5px, transparent 1.5px), radial-gradient(#10b981 1.5px, #ffffff 1.5px)',
  },
  {
    id: 'golden_glow',
    name: 'Golden Citrus Glow',
    css: 'linear-gradient(135deg, #eaff3b 0%, #facc15 50%, #fb923c 100%)',
  },
  {
    id: 'white_3d_cubes',
    name: '3D White Geometric',
    css: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
  },
  {
    id: 'crystal_blue',
    name: 'Crystal Blue Polygon',
    css: 'linear-gradient(180deg, #f8fafc 0%, #bae6fd 55%, #0284c7 100%)',
  },
  {
    id: 'confetti_light',
    name: 'Studio Confetti Light',
    css: 'radial-gradient(circle at 80% 50%, rgba(245, 158, 11, 0.22), rgba(2, 132, 199, 0.15), #f1f5f9 70%)',
  },
  {
    id: 'executive_dark',
    name: 'Executive Obsidian',
    css: 'radial-gradient(circle at 50% 20%, #334155 0%, #0f172a 60%, #020617 100%)',
  },
  {
    id: 'wood_desk',
    name: 'Warm Ivory Paper',
    css: 'linear-gradient(135deg, #fdfcfb 0%, #e2d1c3 100%)',
  },
];

const DEFAULT_DISCLAIMER = `This e-book catalogue is for informational purposes only. While we strive to provide accurate and up-to-date information, we make no guarantees about the completeness, accuracy, or reliability of the content. All products, pricing, and availability are subject to change without prior notice.

We are not responsible for any loss or damage that may result from the use of or reliance on the information in this e-book.

By accessing and using this e-book, you acknowledge and accept these terms.`;

type StudioSection = 'title' | 'page_effect' | 'background' | 'logo' | 'controls' | 'audio';

export default function CustomizationDialog({
  flipbook,
  onClose,
  onSaved,
}: {
  flipbook: Partial<Flipbook> & { id: number; title: string };
  onClose(): void;
  onSaved(): void;
}) {
  const current = (flipbook as unknown as { settings?: FlipbookSettings }).settings || {};

  const [activeSection, setActiveSection] = useState<StudioSection>('title');

  // 1. Title & Disclaimer (Optional — off by default unless enabled by tenant)
  const [companyName, setCompanyName] = useState(current.companyName ?? flipbook.title ?? '');
  const [catalogueSubtitle, setCatalogueSubtitle] = useState(current.catalogueSubtitle ?? '');
  const [disclaimerTitle, setDisclaimerTitle] = useState(current.disclaimerTitle ?? 'Disclaimer');
  const [disclaimerText, setDisclaimerText] = useState(
    current.disclaimerText ?? (flipbook as any).description ?? ''
  );
  // Optional: default false unless tenant turns on "Show titles on the flipbook's background"
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(current.showDisclaimer ?? false);
  const [privateNotes, setPrivateNotes] = useState(current.privateNotes ?? '');

  // 2. Page Effect (Pic 2 & Pic 3)
  const [pageEffect, setPageEffect] = useState<PageEffectType>(current.pageEffect || 'magazine');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(current.soundEnabled ?? true);
  const [horizontalTurn, setHorizontalTurn] = useState<boolean>(current.horizontalTurn ?? true);
  const [rightToLeft, setRightToLeft] = useState<boolean>(current.rightToLeft ?? false);
  const [showMoreEffectOptions, setShowMoreEffectOptions] = useState(false);
  const [defaultReadingMode, setDefaultReadingMode] = useState<'flip' | 'scroll' | 'reader'>(
    current.defaultReadingMode || 'flip'
  );

  // 3. Background (Pic 4: Image | Color | Style)
  const [bgTab, setBgTab] = useState<'image' | 'color' | 'style'>(current.backgroundType || 'image');
  const [background, setBackground] = useState(current.background || '#f1f5f9');
  const [backgroundImage, setBackgroundImage] = useState(current.backgroundImage || '');
  const [backgroundStyle, setBackgroundStyle] = useState(current.backgroundStyle || 'gradient_soft');

  // 4. Logo & Branding
  const [showPoweredBy, setShowPoweredBy] = useState<boolean>(current.showPoweredBy ?? true);
  const [customLogoUrl, setCustomLogoUrl] = useState(current.customLogoUrl || '');
  const [brandText, setBrandText] = useState(current.brandText || '');

  // 5. Controls
  const [allowDownload, setAllowDownload] = useState<boolean>(current.allowDownload ?? false);
  const [showToolbar, setShowToolbar] = useState<boolean>(current.showToolbar ?? true);
  const [showThumbnailsButton, setShowThumbnailsButton] = useState<boolean>(current.showThumbnailsButton ?? true);
  const [showSearchButton, setShowSearchButton] = useState<boolean>(current.showSearchButton ?? true);
  const [showShareButton, setShowShareButton] = useState<boolean>(current.showShareButton ?? true);
  const [showFullscreenButton, setShowFullscreenButton] = useState<boolean>(current.showFullscreenButton ?? true);

  // 6. Background Audio
  const [bgAudioUrl, setBgAudioUrl] = useState(current.bgAudioUrl || '');
  const [bgAudioAutoplay, setBgAudioAutoplay] = useState<boolean>(current.bgAudioAutoplay ?? false);
  const [bgAudioLoop, setBgAudioLoop] = useState<boolean>(current.bgAudioLoop ?? true);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleBgFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(`url(${reader.result})`);
        setBgTab('image');
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const cleanTitle = companyName.trim() || flipbook.title || 'Untitled Flipbook';
      await api(`/flipbooks/${flipbook.id}`, 'PATCH', {
        title: cleanTitle,
        settings: {
          ...current,
          companyName: cleanTitle,
          catalogueSubtitle,
          disclaimerTitle,
          disclaimerText,
          showDisclaimer,
          privateNotes,
          pageEffect,
          soundEnabled,
          horizontalTurn,
          rightToLeft,
          defaultReadingMode,
          background,
          backgroundType: bgTab,
          backgroundImage,
          backgroundStyle,
          showPoweredBy,
          customLogoUrl,
          brandText,
          allowDownload,
          showToolbar,
          showThumbnailsButton,
          showSearchButton,
          showShareButton,
          showFullscreenButton,
          bgAudioUrl,
          bgAudioAutoplay,
          bgAudioLoop,
        },
      });
      flipbook.title = cleanTitle;
      setMsg('Saved successfully!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    } catch (e: any) {
      setMsg(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const navItems: Array<{ id: StudioSection; icon: string; label: string }> = [
    { id: 'title', icon: 'A', label: 'Title' },
    { id: 'page_effect', icon: '📗', label: 'Page Effect' },
    { id: 'background', icon: '🖼️', label: 'Background' },
    { id: 'logo', icon: '★', label: 'Logo' },
    { id: 'controls', icon: '🔘', label: 'Controls' },
    { id: 'audio', icon: '🔊', label: 'Background Audio' },
  ];

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="hz-studio-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Style Sidebar (Matching Heyzine STYLE menu in Pic 1, 2, 4) */}
        <div className="hz-studio-sidebar">
          <div className="hz-studio-sidebar-header">▾ STYLE</div>
          <div className="hz-studio-nav-list">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`hz-studio-nav-btn ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="hz-studio-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Dialog Content Card */}
        <div className="hz-studio-content">
          <div className="hz-studio-header">
            <h3>
              {activeSection === 'title' && 'Flipbook Settings'}
              {activeSection === 'page_effect' && 'Page effect'}
              {activeSection === 'background' && 'Background'}
              {activeSection === 'logo' && 'Logo & Branding'}
              {activeSection === 'controls' && 'Viewer Controls'}
              {activeSection === 'audio' && 'Background Audio'}
            </h3>
            <button type="button" className="hz-studio-close-x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="hz-studio-body">
            {/* ==================== 1. TITLE & DISCLAIMER (Pic 1) ==================== */}
            {activeSection === 'title' && (
              <div className="hz-form-grid">
                <div className="hz-form-row">
                  <label className="hz-form-label">Title:</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="e.g. MANNAT INVESTMENTS PTE LTD"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div className="hz-form-row">
                  <label className="hz-form-label">Subtitle:</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="e.g. CATALOGUE"
                    value={catalogueSubtitle}
                    onChange={(e) => setCatalogueSubtitle(e.target.value)}
                  />
                </div>

                <div className="hz-form-row align-top">
                  <label className="hz-form-label">Description:</label>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="text"
                      className="hz-form-input"
                      placeholder="Optional Heading (e.g. Disclaimer)"
                      value={disclaimerTitle}
                      onChange={(e) => setDisclaimerTitle(e.target.value)}
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                    />
                    <textarea
                      rows={4}
                      className="hz-form-textarea"
                      placeholder="Optional description or legal disclaimer text shown on the flipbook's background..."
                      value={disclaimerText}
                      onChange={(e) => setDisclaimerText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        className="link"
                        style={{ fontSize: '11px' }}
                        onClick={() => {
                          setDisclaimerTitle('Disclaimer');
                          setDisclaimerText(DEFAULT_DISCLAIMER);
                          setShowDisclaimer(true);
                        }}
                      >
                        + Fill Sample Catalogue Disclaimer
                      </button>
                      {disclaimerText && (
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: '11px', color: '#dc2626' }}
                          onClick={() => setDisclaimerText('')}
                        >
                          Clear Text
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hz-form-row">
                  <div className="hz-form-label" />
                  <label className="hz-switch-row">
                    <input
                      type="checkbox"
                      checked={showDisclaimer}
                      onChange={(e) => setShowDisclaimer(e.target.checked)}
                    />
                    <span className="hz-switch-slider" />
                    <span className="hz-switch-text">Show titles on the flipbook's background.</span>
                  </label>
                </div>

                <div className="hz-form-row align-top">
                  <label className="hz-form-label">Private notes:</label>
                  <textarea
                    rows={2}
                    className="hz-form-textarea"
                    placeholder="Internal publisher notes (only visible to your team)..."
                    value={privateNotes}
                    onChange={(e) => setPrivateNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ==================== 2. PAGE EFFECT (Pic 2 & Pic 3) ==================== */}
            {activeSection === 'page_effect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 8px' }}>
                <select
                  className="hz-form-select"
                  value={pageEffect}
                  onChange={(e) => setPageEffect(e.target.value as PageEffectType)}
                >
                  <option value="magazine">Magazine</option>
                  <option value="book">Book</option>
                  <option value="album">Album</option>
                  <option value="notebook">Notebook</option>
                  <option value="slider">Slider</option>
                  <option value="cards">Cards</option>
                  <option value="coverflow">Coverflow</option>
                  <option value="one_page">One page</option>
                </select>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Sound on page turn</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={horizontalTurn}
                    onChange={(e) => setHorizontalTurn(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Horizontal turn</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={rightToLeft}
                    onChange={(e) => setRightToLeft(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Right-To-Left read</span>
                </label>

                <div>
                  <button
                    type="button"
                    className="hz-more-options-link"
                    onClick={() => setShowMoreEffectOptions(!showMoreEffectOptions)}
                  >
                    {showMoreEffectOptions ? '▾ Less options' : 'More options'}
                  </button>

                  {showMoreEffectOptions && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#334155' }}>
                        Default Reader Mode:
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                          { id: 'flip', label: '📖 3D Page-Turn' },
                          { id: 'scroll', label: '📜 Vertical Scroll' },
                          { id: 'reader', label: '♿ Accessible Text' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setDefaultReadingMode(m.id as 'flip' | 'scroll' | 'reader')}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: defaultReadingMode === m.id ? '#0284c7' : '#ffffff',
                              color: defaultReadingMode === m.id ? '#ffffff' : '#334155',
                              fontWeight: 600,
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== 3. BACKGROUND (Pic 4: Image | Color | Style) ==================== */}
            {activeSection === 'background' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="hz-subtabs">
                  {(['image', 'color', 'style'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`hz-subtab-btn ${bgTab === t ? 'active' : ''}`}
                      onClick={() => setBgTab(t)}
                    >
                      {t === 'image' ? 'Image' : t === 'color' ? 'Color' : 'Style'}
                    </button>
                  ))}
                </div>

                {bgTab === 'image' && (
                  <>
                    {/* Action toolbar matching Pic 4 (Gallery, Upload, Clear) */}
                    <div className="hz-bg-toolbar">
                      <button
                        type="button"
                        className={`hz-bg-tool-btn ${backgroundImage ? 'active' : ''}`}
                        title="Preset Background Gallery"
                      >
                        🖼️
                      </button>
                      <label className="hz-bg-tool-btn" title="Upload Custom Background Image" style={{ cursor: 'pointer' }}>
                        ☁️
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBgFileUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        className="hz-bg-tool-btn"
                        title="Clear Background Image"
                        onClick={() => setBackgroundImage('')}
                      >
                        ✖
                      </button>
                    </div>

                    <div className="hz-bg-gallery">
                      {PRESET_BACKGROUNDS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`hz-bg-thumb ${backgroundImage === preset.css ? 'selected' : ''}`}
                          style={{
                            background: preset.css,
                            backgroundSize: preset.id === 'halftone_dots' ? '18px 18px' : 'cover',
                          }}
                          onClick={() => setBackgroundImage(preset.css)}
                          title={preset.name}
                        />
                      ))}
                    </div>
                  </>
                )}

                {bgTab === 'color' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '8px 4px' }}>
                    <div className="theme-palette">
                      {[
                        { name: 'Clean White', color: '#ffffff' },
                        { name: 'Studio Light', color: '#f1f5f9' },
                        { name: 'Warm Cream', color: '#fbf9f4' },
                        { name: 'Obsidian Slate', color: '#18191c' },
                        { name: 'Deep Midnight', color: '#0f172a' },
                        { name: 'Forest Dark', color: '#14281d' },
                      ].map((t) => (
                        <button
                          key={t.color}
                          type="button"
                          className={`theme-chip ${background === t.color && !backgroundImage ? 'active' : ''}`}
                          style={{
                            background: t.color,
                            color: ['#ffffff', '#fbf9f4', '#f1f5f9'].includes(t.color) ? '#0f172a' : '#fff',
                            border: background === t.color ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          }}
                          onClick={() => {
                            setBackground(t.color);
                            setBackgroundImage('');
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Custom Hex Color:</span>
                      <input
                        type="color"
                        value={background}
                        onChange={(e) => {
                          setBackground(e.target.value);
                          setBackgroundImage('');
                        }}
                        style={{ width: '44px', height: '34px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <code style={{ fontSize: '13px', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                        {background}
                      </code>
                    </div>
                  </div>
                )}

                {bgTab === 'style' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      Background Fill & Texture Style:
                    </label>
                    {[
                      { id: 'gradient_soft', label: 'Soft Ambient Vignette' },
                      { id: 'flat_solid', label: 'Flat Solid Color' },
                      { id: 'paper_grain', label: 'Subtle Magazine Studio Grain' },
                    ].map((st) => (
                      <label key={st.id} className="hz-switch-row">
                        <input
                          type="radio"
                          name="bgStyle"
                          checked={backgroundStyle === st.id}
                          onChange={() => setBackgroundStyle(st.id)}
                        />
                        <span className="hz-switch-text">{st.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==================== 4. LOGO & BRANDING ==================== */}
            {activeSection === 'logo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={showPoweredBy}
                    onChange={(e) => setShowPoweredBy(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">
                    Show Bottom-Left “Powered by <b style={{ color: '#d97706' }}>Nuvis</b> Flipex” Badge
                  </span>
                </label>

                <div className="hz-form-row">
                  <label className="hz-form-label">Header Badge:</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="e.g. Nuvis Flipex"
                    value={brandText}
                    onChange={(e) => setBrandText(e.target.value)}
                  />
                </div>

                <div className="hz-form-row">
                  <label className="hz-form-label">Custom Logo URL:</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="Optional https://... logo URL"
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ==================== 5. CONTROLS ==================== */}
            {activeSection === 'controls' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={allowDownload}
                    onChange={(e) => setAllowDownload(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Allow Readers to Download Original PDF</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={showSearchButton}
                    onChange={(e) => setShowSearchButton(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Show Search Inside Publication Button</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={showThumbnailsButton}
                    onChange={(e) => setShowThumbnailsButton(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Show Page Thumbnails Drawer Button</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={showShareButton}
                    onChange={(e) => setShowShareButton(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Show Social & Page Share Button</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={showFullscreenButton}
                    onChange={(e) => setShowFullscreenButton(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Show Fullscreen Button</span>
                </label>
              </div>
            )}

            {/* ==================== 6. BACKGROUND AUDIO ==================== */}
            {activeSection === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="hz-form-row">
                  <label className="hz-form-label">MP3 Audio URL:</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="https://example.com/ambient-music.mp3"
                    value={bgAudioUrl}
                    onChange={(e) => setBgAudioUrl(e.target.value)}
                  />
                </div>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={bgAudioAutoplay}
                    onChange={(e) => setBgAudioAutoplay(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Autoplay ambient audio when flipbook opens</span>
                </label>

                <label className="hz-switch-row">
                  <input
                    type="checkbox"
                    checked={bgAudioLoop}
                    onChange={(e) => setBgAudioLoop(e.target.checked)}
                  />
                  <span className="hz-switch-slider" />
                  <span className="hz-switch-text">Loop background audio continuously</span>
                </label>
              </div>
            )}
          </div>

          <div className="hz-studio-footer">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="hz-btn-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hz-btn-close"
            >
              Close
            </button>
            {msg && <span className="hz-save-msg">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
