import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <span>Loading Business Storefront…</span>
        </div>
      </div>
    );
  }

  if (error || !storefront) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-100 shadow-2xl">
          <h2 className="text-xl font-bold mb-2">Storefront Not Found</h2>
          <p className="text-xs text-slate-400 mb-6">{error || 'This business profile is not currently available.'}</p>
          <Link to="/" className="btn-primary inline-flex text-xs">
            Return to Flipex
          </Link>
        </div>
      </div>
    );
  }

  const cleanWaNumber = (storefront.whatsappPhone || storefront.phone || '').replace(/[^0-9]/g, '');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Brand Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white font-extrabold text-sm tracking-tight">
            <span className="h-6 w-6 rounded bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 text-xs font-black shadow">
              F
            </span>
            <span>Nuvis Flipex Business</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyStorefrontLink}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Copied Link' : 'Share'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-bold transition shadow-sm"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </header>

      {/* Hero Storefront Banner */}
      <section className="relative border-b border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900/60 to-slate-950 pt-10 pb-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl border-2 border-slate-700 bg-slate-800 flex items-center justify-center font-bold text-2xl text-amber-400 shadow-xl overflow-hidden shrink-0">
                {storefront.logoUrl ? (
                  <img src={storefront.logoUrl} alt={storefront.businessName} className="h-full w-full object-cover" />
                ) : (
                  storefront.businessName.substring(0, 2).toUpperCase()
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight m-0">
                    {storefront.businessName}
                  </h1>
                  {storefront.isVerified && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified Business
                    </span>
                  )}
                </div>

                {storefront.tagline && (
                  <p className="text-xs md:text-sm text-slate-400 mt-1 mb-2 max-w-xl font-medium">
                    {storefront.tagline}
                  </p>
                )}

                {storefront.bio && (
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    {storefront.bio}
                  </p>
                )}

                {/* Contact Badges */}
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  {cleanWaNumber && (
                    <a
                      href={`https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
                        `Hello ${storefront.businessName}, I am viewing your online catalogues on Nuvis Flipex and would like to inquire about your products.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <span>💬</span> WhatsApp Orders
                    </a>
                  )}

                  {storefront.phone && (
                    <a
                      href={`tel:${storefront.phone}`}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition"
                    >
                      <span>📞</span> {storefront.phone}
                    </a>
                  )}

                  {storefront.email && (
                    <a
                      href={`mailto:${storefront.email}`}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition"
                    >
                      <span>✉️</span> {storefront.email}
                    </a>
                  )}

                  {storefront.address && (
                    <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 inline-flex items-center gap-1.5">
                      <span>📍</span> {storefront.address}
                    </span>
                  )}

                  {storefront.websiteUrl && (
                    <a
                      href={storefront.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-amber-400 inline-flex items-center gap-1 transition"
                    >
                      <span>🌐 Website</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Publications Showcase Section */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white m-0">Published Catalogues &amp; Digital Editions</h2>
            <p className="text-xs text-slate-400 m-0 mt-0.5">
              Browse interactive publications with page-turning, product spotlight tags, and instant inquiry tools.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search catalogues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
          </div>
        </div>

        {filteredCatalogues.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 p-8">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No published publications found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {search ? 'Try clearing your search query to view all available editions.' : 'Check back soon for new digital editions from this publisher.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredCatalogues.map((cat) => (
              <div
                key={cat.id}
                className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 hover:border-amber-400/60 transition-all duration-200 overflow-hidden shadow-lg hover:shadow-2xl"
              >
                {/* Publication Cover Image */}
                <div className="relative aspect-[3/4] bg-slate-950 overflow-hidden">
                  <img
                    src={cat.coverUrl}
                    alt={cat.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <a
                      href={cat.readerUrl}
                      className="w-full py-2 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open Interactive Reader</span>
                    </a>
                  </div>
                </div>

                {/* Publication Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-2 m-0">
                      {cat.title}
                    </h3>
                    {cat.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 mb-2">
                        {cat.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{cat.pageCount} Pages</span>
                    <a
                      href={cat.readerUrl}
                      className="text-amber-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>Read</span>
                      <span>→</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-4 text-center text-xs text-slate-500">
        <p className="m-0">
          Powered by <span className="text-slate-300 font-semibold">Nuvis Flipex</span> · Commercial Publishing &amp; Interactive Catalogues
        </p>
      </footer>

      {/* B2B / Wholesale Contact Modal */}
      {showContactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setShowContactModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">
              Contact {storefront.businessName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Send a direct commercial inquiry, price quote request, or distribution question.
            </p>

            {contactSuccess ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center text-xs text-emerald-300">
                ✓ {contactSuccess}
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Your Full Name *</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Nilesh Chandra"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="nilesh@example.com"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Phone / WhatsApp</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+679 999 1234"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Message or Product Inquiries</label>
                  <textarea
                    rows={3}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Describe the items you are interested in ordering..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={contactBusy}
                    className="px-4 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 disabled:opacity-50"
                  >
                    {contactBusy ? 'Sending…' : 'Send Inquiry'}
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
