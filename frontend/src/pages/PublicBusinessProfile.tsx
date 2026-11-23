import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import './bizProfile.css';
import {
  ExternalLink,
  Search,
  Share2,
  CheckCircle2,
  FileText,
  Eye,
  Check,
  Send,
  X,
} from '../components/ui/icons';

interface StorefrontData {
  id: number;
  tenantId: number;
  businessName: string;
  slug: string;
  canonicalUrl?: string;
  redirectedFrom?: string | null;
  tagline: string;
  bio: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  address: string;
  websiteUrl: string;
  facebookUrl?: string;
  instagramUrl?: string;
  bannerUrl: string;
  logoUrl: string;
  isVerified: boolean;
  currency: string;
  themePrimary?: string;
  themeSecondary?: string;
  cataloguesCount: number;
}

interface CatalogueItem {
  id: number;
  title: string;
  slug: string;
  description: string;
  pageCount: number;
  coverUrl: string;
  readerUrl: string;
  brandAccentColor: string;
  createdAt: string;
}

export default function PublicBusinessProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [catalogues, setCatalogues] = useState<CatalogueItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Contact Modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactSuccess, setContactSuccess] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api<{ storefront: StorefrontData; catalogues: CatalogueItem[] }>(`/public/biz/${slug}`)
      .then((res) => {
        setStorefront(res.storefront);
        setCatalogues(res.catalogues || []);
        setLoading(false);

        if (res.storefront) {
          document.title = `${res.storefront.businessName} — Digital Publications | Nuvis Flipex`;
          if (res.storefront.redirectedFrom && res.storefront.slug) {
            try {
              window.history.replaceState(null, '', `/${res.storefront.slug}`);
            } catch {
              // ignore
            }
          }
        }
      })
      .catch((err) => {
        setError(err.message || 'Business profile not found');
        setLoading(false);
      });
  }, [slug]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !slug) return;
    setContactBusy(true);
    try {
      await api(`/public/biz/${slug}/contact`, 'POST', {
        name: contactName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
        message: contactMessage.trim(),
      });
      setContactSuccess('Your message has been sent directly to the sales team!');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactMessage('');
      setTimeout(() => {
        setContactSuccess('');
        setShowContactModal(false);
      }, 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to send inquiry');
    } finally {
      setContactBusy(false);
    }
  };

  const copyStorefrontLink = () => {
    const canonical = storefront?.slug ? `${window.location.origin}/${storefront.slug}` : window.location.href;
    navigator.clipboard?.writeText(canonical).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const filteredCatalogues = catalogues.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="bp bp-center">
        <div style={{ textAlign: 'center' }}>
          <div className="bp-spin" />
          <span>Loading publisher profile…</span>
        </div>
      </div>
    );
  }

  if (error || !storefront) {
    const isServerError = error && (error.toLowerCase().includes('server') || error.toLowerCase().includes('unavailable') || error.toLowerCase().includes('failed'));
    return (
      <div className="bp bp-center">
        <div className="bp-state-card">
          <h2>{isServerError ? 'Temporary Connection Notice' : 'Publisher Not Found'}</h2>
          <p>{error || 'This publisher profile is not currently available.'}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button type="button" onClick={() => window.location.reload()} className="bp-btn">
              ↻ Refresh
            </button>
            <Link to="/" className="bp-btn primary">
              Return to Flipex
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cleanWaNumber = (storefront.whatsappPhone || storefront.phone || '').replace(/[^0-9]/g, '');
  const totalPages = catalogues.reduce((a, c) => a + (c.pageCount || 0), 0);

  return (
    <div
      className="bp"
      style={{
        '--bp-brand': storefront.themePrimary || '#0b3a6e',
        '--bp-brand-2': storefront.themeSecondary || '#1d6fb8',
      } as React.CSSProperties}
    >
      <header className="bp-top">
        <div className="bp-wrap bp-top-in">
          <Link to="/" className="bp-brandmark">
            <i>F</i>
            <span>Nuvis Flipex</span>
          </Link>
          <div className="bp-actions">
            <button type="button" className="bp-btn" onClick={copyStorefrontLink}>
              {copiedLink ? <Check /> : <Share2 />}
              <span>{copiedLink ? 'Link copied' : 'Share'}</span>
            </button>
            <button type="button" className="bp-btn primary" onClick={() => setShowContactModal(true)}>
              Contact Sales
            </button>
          </div>
        </div>
      </header>

      <section className="bp-hero">
        <div className="bp-wrap bp-hero-in">
          <div className="bp-logo">
            {storefront.logoUrl ? (
              <img src={storefront.logoUrl} alt={storefront.businessName} />
            ) : (
              storefront.businessName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <div className="bp-name-row">
              <h1 className="bp-name">{storefront.businessName}</h1>
              {storefront.isVerified && (
                <span className="bp-verified">
                  <CheckCircle2 />
                  Verified Business
                </span>
              )}
            </div>
            {storefront.tagline && <p className="bp-tag">{storefront.tagline}</p>}
            {storefront.bio && <p className="bp-bio">{storefront.bio}</p>}

            <div className="bp-chips">
              {cleanWaNumber && (
                <a
                  className="bp-chip"
                  href={`https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
                    `Hello ${storefront.businessName}, I am viewing your online catalogues on Nuvis Flipex and would like to inquire about your products.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 WhatsApp Orders
                </a>
              )}
              {storefront.phone && (
                <a className="bp-chip" href={`tel:${storefront.phone}`}>
                  📞 {storefront.phone}
                </a>
              )}
              {storefront.email && (
                <a className="bp-chip" href={`mailto:${storefront.email}`}>
                  ✉️ {storefront.email}
                </a>
              )}
              {storefront.address && <span className="bp-chip">📍 {storefront.address}</span>}
              {storefront.websiteUrl && (
                <a className="bp-chip" href={storefront.websiteUrl} target="_blank" rel="noopener noreferrer">
                  🌐 Website <ExternalLink />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="bp-stats">
        <div className="bp-wrap bp-stats-in">
          <div className="bp-stat">
            <b>{catalogues.length}</b>
            <span>Published Catalogues</span>
          </div>
          <div className="bp-stat">
            <b>{totalPages}</b>
            <span>Total Pages</span>
          </div>
          <div className="bp-stat">
            <b>{storefront.currency || 'FJD'}</b>
            <span>Currency</span>
          </div>
        </div>
      </div>

      <main className="bp-main">
        <div className="bp-wrap">
          <div className="bp-sec-head">
            <div>
              <h2 className="bp-sec-title">Catalogues &amp; Digital Editions</h2>
              <p className="bp-sec-sub">Browse interactive publications with page-turning, product details, and instant enquiry.</p>
            </div>
            <div className="bp-search">
              <Search />
              <input
                type="text"
                placeholder="Search catalogues…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredCatalogues.length === 0 ? (
            <div className="bp-empty">
              <FileText />
              <b>No published catalogues found</b>
              <p>
                {search
                  ? 'Try clearing your search to view all available editions.'
                  : 'Check back soon for new digital editions from this publisher.'}
              </p>
            </div>
          ) : (
            <div className="bp-grid">
              {filteredCatalogues.map((cat) => (
                <article key={cat.id} className="bp-card">
                  <a href={cat.readerUrl} className="bp-cover" aria-label={`Open ${cat.title}`}>
                    {cat.coverUrl ? (
                      <img src={cat.coverUrl} alt={cat.title} loading="lazy" />
                    ) : (
                      <div className="bp-cover-empty">
                        <FileText />
                      </div>
                    )}
                    <span className="bp-pages">{cat.pageCount} pages</span>
                  </a>
                  <div className="bp-body">
                    <h3 className="bp-card-title">{cat.title}</h3>
                    {cat.description && <p className="bp-card-desc">{cat.description}</p>}
                    <div className="bp-card-foot">
                      <a href={cat.readerUrl} className="bp-read">
                        <Eye />
                        <span>Read Catalogue</span>
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="bp-foot">
        <div className="bp-wrap">
          Powered by <b>Nuvis Flipex</b> · Commercial Publishing &amp; Interactive Catalogues
        </div>
      </footer>

      {showContactModal && (
        <div className="bp-overlay" onClick={() => setShowContactModal(false)}>
          <div className="bp-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="bp-x" onClick={() => setShowContactModal(false)} aria-label="Close">
              <X />
            </button>
            <h3>Contact {storefront.businessName}</h3>
            <p className="sub">Send a direct commercial enquiry, price quote request, or distribution question.</p>

            {contactSuccess ? (
              <div className="bp-ok">✓ {contactSuccess}</div>
            ) : (
              <form onSubmit={handleContactSubmit}>
                <div className="bp-field">
                  <label>Your Full Name *</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                  />
                </div>
                <div className="bp-row2">
                  <div className="bp-field">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div className="bp-field">
                    <label>Phone / WhatsApp</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+679 999 1234"
                    />
                  </div>
                </div>
                <div className="bp-field">
                  <label>Message or Product Enquiries</label>
                  <textarea
                    rows={3}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Describe the items you are interested in ordering…"
                  />
                </div>
                <div className="bp-modal-actions">
                  <button type="button" className="bp-btn" onClick={() => setShowContactModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="bp-btn primary" disabled={contactBusy}>
                    {contactBusy ? 'Sending…' : 'Send Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
