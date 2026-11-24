import { APP_VERSION } from '../version';
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface DirectoryEntry {
  id: number;
  flipbookId: number;
  title: string;
  description: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  currency: string;
  regionName: string;
  category: string;
  tags: string[];
  coverImageUrl: string;
  isFeatured: boolean;
  viewCount: number;
  pagesCount: number;
  readerUrl: string;
  publisherName: string;
  createdAt: string;
}

interface AdBanner {
  id: number;
  campaignName: string;
  advertiserName: string;
  targetUrl: string;
  bannerImageUrl: string;
  headline: string;
  subtext: string;
  ctaText: string;
  currency: string;
}

interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  currency: string;
  count: number;
}

const CATEGORIES = [
  { id: 'ALL', label: 'All Publications', icon: '🌐' },
  { id: 'commercial', label: 'Commercial & Retail', icon: '🛍️' },
  { id: 'education', label: 'Schools & Academic', icon: '🎓' },
  { id: 'tourism', label: 'Tourism & Hospitality', icon: '🏖️' },
  { id: 'government', label: 'Government & Public', icon: '🏛️' },
  { id: 'lifestyle', label: 'Magazines & Culture', icon: '📖' },
];

export default function PublicDirectory() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [featured, setFeatured] = useState<DirectoryEntry[]>([]);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [ads, setAds] = useState<AdBanner[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'featured'>('popular');
  const [activeCurrency, setActiveCurrency] = useState<'FJD' | 'AUD' | 'NZD' | 'USD'>('FJD');

  const fetchDirectory = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (selectedCountry !== 'ALL') q.set('country', selectedCountry);
      if (selectedCategory !== 'ALL') q.set('category', selectedCategory);
      if (searchQuery.trim()) q.set('search', searchQuery.trim());
      q.set('sort', sortBy);
      q.set('currency', activeCurrency);

      const res = await api<any>(`/public/directory?${q.toString()}`, 'GET');
      if (res?.entries) setEntries(res.entries);
      if (res?.featured) setFeatured(res.featured);
      if (res?.countries) setCountries(res.countries);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchAds = async () => {
    try {
      const q = new URLSearchParams({ placement_type: 'header_banner' });
      if (selectedCountry !== 'ALL') q.set('country', selectedCountry);
      const res = await api<any>(`/public/ads/serve?${q.toString()}`, 'GET');
      if (res?.ads) setAds(res.ads);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDirectory();
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedCountry, selectedCategory, searchQuery, sortBy, activeCurrency]);

  useEffect(() => {
    fetchAds();
  }, [selectedCountry]);

  const handleTrackAdClick = async (ad: AdBanner) => {
    try {
      await api(`/public/ads/${ad.id}/track`, 'POST', {
        event_type: 'click',
        country_code: selectedCountry,
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-950 font-sans">
      {/* Top Global Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center font-black text-slate-950 shadow-md">
                N
              </div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-amber-200 bg-clip-text text-transparent">
                Nuvis Flipex
              </span>
            </a>
            <span className="hidden sm:inline-block text-xs uppercase tracking-widest font-bold text-amber-400/80 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
              Pacific Regional Directory
            </span>
          </div>

          {/* Right Action: Multi-Currency & Publisher Portal */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/60 p-1 text-xs">
              {(['FJD', 'AUD', 'NZD', 'USD'] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setActiveCurrency(curr)}
                  className={`px-2 py-1 rounded font-semibold transition-colors ${
                    activeCurrency === curr
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            <a
              href="/dashboard"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              Publisher Portal ↗
            </a>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-4">
          <Badge variant="golden" className="px-3 py-1 text-xs">
            🌺 Fiji & South Pacific Digital Publications
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Discover Magazines, Commercial Catalogues & School Yearbooks
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            Explore verified interactive digital publications from Fiji, Samoa, Tonga, Vanuatu, PNG, Solomon Islands, Australia, and New Zealand.
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto pt-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search publications by title, company, town or tag (e.g. Mannat, Yearbook, Tourism, Suva)..."
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 shadow-xl focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              />
              <span className="absolute left-4 top-3.5 text-slate-400">
                🔍
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-3 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {/* Country Island Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedCountry('ALL')}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              selectedCountry === 'ALL'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>🌴</span>
            <span>All Pacific</span>
          </button>
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelectedCountry(c.code)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedCountry === c.code
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
              {c.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCountry === c.code ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                  {c.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Categories Bar & Sort Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-slate-100 text-slate-950 font-bold'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
            >
              <option value="popular">Most Popular</option>
              <option value="newest">Recently Published</option>
              <option value="featured">Featured Picks</option>
            </select>
          </div>
        </div>

        {/* Sponsored Ad Banner Carousel (if ads available) */}
        {ads.length > 0 && (
          <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 p-4 shadow-lg">
            <div className="flex items-center justify-between text-[11px] mb-2 text-slate-400">
              <span className="font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                Sponsored Pacific Spotlight
              </span>
              <span>Promoted</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ads.map((ad) => (
                <a
                  key={ad.id}
                  href={ad.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleTrackAdClick(ad)}
                  className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-amber-400/50 transition-colors group"
                >
                  <img
                    src={ad.bannerImageUrl}
                    alt={ad.headline || ad.campaignName}
                    className="w-20 h-20 rounded-lg object-cover shrink-0 border border-slate-800"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-amber-300 font-bold uppercase">{ad.advertiserName}</span>
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                      {ad.headline || ad.campaignName}
                    </h3>
                    {ad.subtext && (
                      <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{ad.subtext}</p>
                    )}
                    <span className="inline-block mt-2 text-[11px] font-semibold text-amber-400 group-hover:underline">
                      {ad.ctaText} →
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Publications Grid */}
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400">Loading Pacific publications…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-20 px-4 text-center space-y-3 bg-slate-900/30">
            <div className="text-4xl">🏝️</div>
            <h3 className="text-base font-bold text-slate-200">No Publications Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              We couldn't find publications matching your current filters. Try selecting a different island or category.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCountry('ALL');
                setSelectedCategory('ALL');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {entries.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-2xl"
              >
                {/* Cover Image */}
                <div className="relative aspect-[3/4] w-full bg-slate-950 overflow-hidden">
                  <img
                    src={item.coverImageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-950/80 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-white shadow flex items-center gap-1">
                      <span>{item.countryFlag}</span>
                      <span>{item.regionName || item.countryName}</span>
                    </span>
                    {item.isFeatured && (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950 shadow">
                        ★ Featured
                      </span>
                    )}
                  </div>

                  <span className="absolute bottom-3 right-3 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300 backdrop-blur">
                    {item.pagesCount} Pages
                  </span>
                </div>

                {/* Content Information */}
                <div className="flex flex-col flex-1 p-4 space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-amber-400/90 uppercase tracking-wider text-[10px]">
                      {item.category}
                    </span>
                    <span className="text-slate-500">
                      👁️ {item.viewCount.toLocaleString()} views
                    </span>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                      {item.description || `Digital publication by ${item.publisherName}`}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300 truncate max-w-[140px]">
                      {item.publisherName}
                    </span>
                    <a
                      href={item.readerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Read Now ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-8 px-4 sm:px-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Nuvis Flipex v{APP_VERSION} · Pacific Regional Digital Publishing Platform.</p>
          <div className="flex items-center gap-4">
            <a href="/explore" className="hover:text-slate-300">Directory</a>
            <a href="/dashboard" className="hover:text-slate-300">Publishers</a>
            <a href="/privacy" className="hover:text-slate-300">Privacy & Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
