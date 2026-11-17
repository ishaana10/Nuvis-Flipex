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
  Lock,
} from '../components/ui/icons';

interface SchoolProfile {
  institutionName: string;
  motto: string;
  academicYear: string;
  institutionType: string;
  principalName: string;
  campusAddress: string;
  contactEmail: string;
  contactPhone: string;
  crestUrl: string;
  bannerUrl: string;
  portalSlug: string;
  allowedEmailDomains: string;
}

interface SchoolPublication {
  id: number;
  title: string;
  slug: string;
  description: string;
  pageCount: number;
  coverUrl: string;
  readerUrl: string;
  pinProtected: boolean;
  domainRestricted: boolean;
  academicTerm: string;
  brandAccentColor: string;
  createdAt: string;
}

interface SchoolPortalData {
  profile: SchoolProfile;
  categories: {
    yearbooks: SchoolPublication[];
    newsletters: SchoolPublication[];
    syllabus: SchoolPublication[];
    exam_papers: SchoolPublication[];
    sports_programs: SchoolPublication[];
    general: SchoolPublication[];
  };
  totalPublications: number;
}

export default function PublicSchoolPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<SchoolPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    api<SchoolPortalData>(`/public/edu/${slug}`)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || 'Educational portal not found or currently unavailable.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Loading educational portal…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="text-4xl mb-3">🎓</div>
        <h2 className="text-xl font-bold mb-2">School Portal Unavailable</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">{error || 'Unable to load school publications.'}</p>
        <Link to="/login" className="btn-primary text-xs py-2.5 px-5">
          Go to Sign In
        </Link>
      </div>
    );
  }

  const { profile, categories, totalPublications } = data;

  // Flatten publications based on active category
  const allPubs: SchoolPublication[] = [
    ...categories.yearbooks,
    ...categories.newsletters,
    ...categories.syllabus,
    ...categories.exam_papers,
    ...categories.sports_programs,
    ...categories.general,
  ];

  let displayPubs = allPubs;
  if (activeTab === 'yearbooks') displayPubs = categories.yearbooks;
  else if (activeTab === 'newsletters') displayPubs = categories.newsletters;
  else if (activeTab === 'syllabus') displayPubs = categories.syllabus;
  else if (activeTab === 'exam_papers') displayPubs = categories.exam_papers;
  else if (activeTab === 'sports_programs') displayPubs = categories.sports_programs;

  const filtered = displayPubs.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.academicTerm && p.academicTerm.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Top Academic Ribbon */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {profile.crestUrl ? (
              <img src={profile.crestUrl} alt="Crest" className="h-9 w-9 object-contain rounded-lg" />
            ) : (
              <span className="text-2xl">🎓</span>
            )}
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                {profile.institutionName}
                <span className="text-[10px] uppercase font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                  Academic Portal
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Academic Year {profile.academicYear} · {profile.institutionType.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2500);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-semibold hover:border-slate-700 transition-colors"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Link Copied' : 'Share Portal'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Header Banner */}
      <section className="relative border-b border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950 py-10 px-4">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          {profile.crestUrl && (
            <div className="h-20 w-20 mb-4 p-2 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              <img src={profile.crestUrl} alt="School Crest" className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
            {profile.institutionName}
          </h1>
          {profile.motto && (
            <p className="text-amber-400 italic font-serif text-sm md:text-base mb-3 max-w-xl">
              &ldquo;{profile.motto}&rdquo;
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mt-1">
            {profile.principalName && (
              <span className="flex items-center gap-1">
                👤 Head of School: <b className="text-slate-200">{profile.principalName}</b>
              </span>
            )}
            {profile.campusAddress && (
              <span className="flex items-center gap-1">📍 {profile.campusAddress}</span>
            )}
            {profile.contactEmail && (
              <a href={`mailto:${profile.contactEmail}`} className="text-amber-400 hover:underline">
                ✉️ {profile.contactEmail}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Educational Publications Grid */}
      <main className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full">
        {/* Category Tabs & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: `All (${totalPublications})`, icon: '📚' },
              { id: 'yearbooks', label: `Yearbooks (${categories.yearbooks.length})`, icon: '🎓' },
              { id: 'newsletters', label: `Newsletters (${categories.newsletters.length})`, icon: '📰' },
              { id: 'syllabus', label: `Syllabus (${categories.syllabus.length})`, icon: '📖' },
              { id: 'exam_papers', label: `Exam Papers (${categories.exam_papers.length})`, icon: '📝' },
              { id: 'sports_programs', label: `Sports & Events (${categories.sports_programs.length})`, icon: '🏆' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="Search school documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
            <div className="text-3xl mb-2">📖</div>
            <h3 className="text-base font-bold text-white mb-1">No Educational Documents Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? `No documents matched "${searchQuery}". Try a different keyword.`
                : 'No publications have been released under this educational category yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filtered.map((pub) => (
              <div
                key={pub.id}
                className="group flex flex-col rounded-2xl border border-slate-800/80 bg-slate-900/70 hover:border-amber-400/50 hover:bg-slate-900 transition-all overflow-hidden shadow-lg"
              >
                <div className="relative aspect-[3/4] bg-slate-950 overflow-hidden flex items-center justify-center">
                  <img
                    src={pub.coverUrl}
                    alt={pub.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {pub.pinProtected && (
                    <div className="absolute top-2.5 left-2.5 bg-slate-950/80 backdrop-blur-md border border-amber-400/40 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="h-3 w-3" /> PIN Protected
                    </div>
                  )}
                  {pub.domainRestricted && (
                    <div className="absolute top-2.5 right-2.5 bg-slate-950/80 backdrop-blur-md border border-blue-400/40 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      🏫 School Domain Only
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1 justify-between">
                  <div>
                    {pub.academicTerm && (
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block mb-1">
                        {pub.academicTerm}
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-white line-clamp-2 mb-1 group-hover:text-amber-400 transition-colors">
                      {pub.title}
                    </h3>
                    {pub.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                        {pub.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">{pub.pageCount} Pages</span>
                    <a
                      href={pub.readerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Read
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Educational Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 px-4 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 text-center sm:text-left">
          <div>
            &copy; {new Date().getFullYear()} {profile.institutionName}. Powered by Nuvis Flipex Educational Publishing Platform.
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hover:text-slate-300 transition-colors">
              Publisher Staff Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
