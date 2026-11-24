import StudioIcon from './studio/StudioIcon';
import { useState, useEffect, type ChangeEvent } from 'react';
import TabBar from './studio/TabBar';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';
import {
  FileText,
  Palette,
  ShieldCheck,
  Share2,
  Tag,
  Eye,
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sliders,
  Layers,
  User,
  Copy,
  Check,
  Upload,
  QrCode,
  Code,
  Download,
  ExternalLink,
} from './ui/icons';

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
  // Title & Background Info
  companyName?: string;
  catalogueSubtitle?: string;
  disclaimerTitle?: string;
  disclaimerText?: string;
  showDisclaimer?: boolean;
  privateNotes?: string;

  // Page Effect
  pageEffect?: PageEffectType;
  soundEnabled?: boolean;
  horizontalTurn?: boolean;
  rightToLeft?: boolean;
  defaultReadingMode?: 'flip' | 'scroll' | 'reader';

  // Background
  background?: string;
  backgroundType?: 'image' | 'color' | 'style';
  backgroundImage?: string;
  backgroundStyle?: string;
  backgroundEffect?: string;
  presetSkinId?: string;
  layoutTemplateId?: string;

  // Logo & Branding (Image 1)
  customLogoUrl?: string;
  logoTargetUrl?: string;
  openLogoIn?: 'new_tab' | 'current_window' | 'none';
  logoLeftPadding?: number;
  logoTopPadding?: number;
  logoHeight?: number;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  brandText?: string;

  // Profile (Image 5)
  showProfileButton?: boolean;
  profileAvatarUrl?: string;
  profileAuthor?: string;
  profileEmail?: string;
  profileUrl?: string;
  profilePhone?: string;
  profileAddress?: string;
  profileDescription?: string;

  // General Settings (Image 7)
  prevNextShortcut?: boolean;
  prevNextColor?: string;
  prevNextHoverColor?: string;
  prevNextBg?: string;
  prevNextHoverBg?: string;
  prevNextMobile?: boolean;
  firstLastPagePrompt?: boolean;
  rightClickMenu?: boolean;
  pageNumberInUrl?: boolean;

  // Preloader Settings (Image 4)
  loadingText?: string;
  loadingFontSize?: number;
  loadingFontColor?: string;
  showLoadingAnimation?: boolean;
  loadingImageUrl?: string;
  loadingImageHeight?: number;
  loadingBgColor?: string;
  minLoadingTime?: number;
  loadingVideoUrl?: string;

  // Display Settings (Image 2)
  showQrCode?: boolean;
  centerBook?: boolean;
  sharpenPages?: boolean;
  rememberLastPage?: boolean;
  initialNavPanel?: 'none' | 'thumbnails' | 'toc' | 'bookmarks';
  hardCover?: boolean;
  shadowDepth?: number;
  pageCornerRadius?: number;

  // Toolbar Appearance Settings (Image 8)
  showToolbar?: boolean;
  alwaysShowToolbarPc?: boolean;
  alwaysShowToolbarMobile?: boolean;
  toolbarColor?: string;
  toolbarOpacity?: number;
  toolbarButtonColor?: string;
  toolbarFontColor?: string;
  pageNumberFontColor?: string;
  panelBgColor?: string;
  panelOpacity?: number;
  panelFontColor?: string;

  // Visual Studio Theming & Custom Color Palette
  brandAccentColor?: string;
  backgroundGradient?: string;
  drawerBgColor?: string;
  drawerHeaderBgColor?: string;
  drawerTextColor?: string;
  drawerActiveColor?: string;
  drawerActiveTextColor?: string;
  headerBgColor?: string;
  headerTextColor?: string;
  navPillBgColor?: string;
  navPillTextColor?: string;
  hotspotHighlightColor?: string;
  fontFamily?: string;

  // Viewer Controls Buttons
  allowDownload?: boolean;
  showThumbnailsButton?: boolean;
  showSearchButton?: boolean;
  showShareButton?: boolean;
  showFullscreenButton?: boolean;
  showAutoFlipButton?: boolean;
  showNotesButton?: boolean;

  // Watermark Settings
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkAngle?: number;
  watermarkRepeat?: boolean;

  // Google Tools & Chatbot
  gaTrackingId?: string;
  gtmContainerId?: string;
  aiChatbotEnabled?: boolean;
  aiBotName?: string;
  aiBotAvatar?: string;
  aiWelcomeMessage?: string;

  // Audio
  bgAudioUrl?: string;
  bgAudioAutoplay?: boolean;
  bgAudioLoop?: boolean;
}

// Visual skin presets matching Image 9 (Themes -> Presets)
export const PRESET_SKINS = [
  {
    id: 'modern_slate',
    name: 'Modern Dark Slate',
    bg: 'radial-gradient(ellipse at 50% 50%, #1a202c 0%, #0b0f17 100%)',
    toolbar: '#0f172a',
    btn: '#f8fafc',
    accent: '#f59e0b',
    drawerBg: '#0d1117',
    drawerHeader: '#161b22',
    drawerText: '#f1f5f9',
    drawerActive: '#f59e0b',
    drawerActiveText: '#0f172a',
  },
  {
    id: 'mannats_classic',
    name: 'Mannats Royal Navy',
    bg: 'radial-gradient(ellipse at 50% 50%, #1e293b 0%, #0f172a 100%)',
    toolbar: '#0f2942',
    btn: '#fbbf24',
    accent: '#fbbf24',
    drawerBg: '#0284c7',
    drawerHeader: '#0369a1',
    drawerText: '#ffffff',
    drawerActive: '#fde047',
    drawerActiveText: '#0f172a',
  },
  {
    id: 'warm_gold_luxe',
    name: 'Warm Gold Luxe',
    bg: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)',
    toolbar: '#292524',
    btn: '#f59e0b',
    accent: '#d97706',
    drawerBg: '#1c1917',
    drawerHeader: '#292524',
    drawerText: '#fafaf9',
    drawerActive: '#f59e0b',
    drawerActiveText: '#1c1917',
  },
  {
    id: 'emerald_prestige',
    name: 'Emerald Prestige',
    bg: 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #0f172a 100%)',
    toolbar: '#064e3b',
    btn: '#34d399',
    accent: '#10b981',
    drawerBg: '#022c22',
    drawerHeader: '#064e3b',
    drawerText: '#ecfdf5',
    drawerActive: '#10b981',
    drawerActiveText: '#022c22',
  },
  {
    id: 'ocean_deep',
    name: 'Ocean Deep Sapphire',
    bg: 'linear-gradient(135deg, #030712 0%, #0c4a6e 50%, #0369a1 100%)',
    toolbar: '#0c4a6e',
    btn: '#38bdf8',
    accent: '#0284c7',
    drawerBg: '#082f49',
    drawerHeader: '#0c4a6e',
    drawerText: '#f0f9ff',
    drawerActive: '#38bdf8',
    drawerActiveText: '#082f49',
  },
  {
    id: 'sunset_crimson',
    name: 'Sunset Crimson',
    bg: 'linear-gradient(135deg, #18181b 0%, #881337 60%, #e11d48 100%)',
    toolbar: '#4c0519',
    btn: '#fda4af',
    accent: '#f43f5e',
    drawerBg: '#27272a',
    drawerHeader: '#3f3f46',
    drawerText: '#fff1f2',
    drawerActive: '#f43f5e',
    drawerActiveText: '#ffffff',
  },
  {
    id: 'pacific_coral',
    name: 'Pacific Coral',
    bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)',
    toolbar: '#ea580c',
    btn: '#ffffff',
    accent: '#ea580c',
    drawerBg: '#ffffff',
    drawerHeader: '#fff7ed',
    drawerText: '#1e293b',
    drawerActive: '#ea580c',
    drawerActiveText: '#ffffff',
  },
  {
    id: 'clean_minimal_light',
    name: 'Clean Minimal Light',
    bg: '#f8fafc',
    toolbar: '#ffffff',
    btn: '#475569',
    accent: '#4f46e5',
    drawerBg: '#ffffff',
    drawerHeader: '#f1f5f9',
    drawerText: '#0f172a',
    drawerActive: '#4f46e5',
    drawerActiveText: '#ffffff',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon Midnight',
    bg: 'linear-gradient(135deg, #050505 0%, #170729 60%, #2e1065 100%)',
    toolbar: '#170729',
    btn: '#a855f7',
    accent: '#c084fc',
    drawerBg: '#09090b',
    drawerHeader: '#18181b',
    drawerText: '#faf5ff',
    drawerActive: '#c084fc',
    drawerActiveText: '#09090b',
  },
  { id: 'classical', name: 'Classical Gray', bg: '#2b2d32', toolbar: '#1e2024', btn: '#d1d5db' },
  { id: 'green', name: 'Nature Green', bg: '#dcfce7', toolbar: '#15803d', btn: '#ffffff' },
  { id: 'freshblue', name: 'Fresh Blue Sky', bg: 'linear-gradient(135deg, #67e8f9 0%, #0284c7 100%)', toolbar: '#0369a1', btn: '#ffffff' },
];

// Layout templates matching Image 3 (Themes -> Layouts)
export const LAYOUT_TEMPLATES = [
  { id: 'refined', name: 'Refined', desc: 'Bottom floating pill navigation bar with sleek icon cluster' },
  { id: 'handy', name: 'Handy', desc: 'Top integrated utility header with quick page jumps' },
  { id: 'active', name: 'Active', desc: 'Full-featured dual top & bottom controls for catalogues' },
  { id: 'classical', name: 'Classical', desc: 'Standard side arrows with minimal bottom page indicator' },
  { id: 'clear', name: 'Clear', desc: 'Zero clutter transparent toolbar with high contrast glyphs' },
  { id: 'popular', name: 'Popular', desc: 'Bottom slider scrubber with page previews and thumbnails' },
  { id: 'facile', name: 'Facile', desc: 'Simplified controls optimized for mobile touch readers' },
  { id: 'float', name: 'Float', desc: 'Floating translucent side navigation controls' },
  { id: 'fresh', name: 'Fresh', desc: 'Vibrant modern magazine toolbar with round buttons' },
  { id: 'gorgeous', name: 'Gorgeous', desc: 'Curved glassmorphic bottom bar with amber accents' },
  { id: 'lively', name: 'Lively', desc: 'Animated button states with glowing page turns' },
  { id: 'neat', name: 'Neat', desc: 'Minimalist edge toolbar for professional brochures' },
  { id: 'pure', name: 'Pure', desc: 'Completely distraction-free fullscreen reader layout' },
  { id: 'simple', name: 'Simple', desc: 'Essential forward/back buttons only' },
  { id: 'specific', name: 'Specific', desc: 'Corporate presentation layout with slide selector' },
  { id: 'minimalist', name: 'Minimalist', desc: 'Ultra-thin subtle borders with quiet aesthetic' },
];

// Dynamic particle / ambient effects
export const AMBIENT_EFFECTS = [
  { id: 'none', name: 'None (Default)' },
  { id: 'falling_leaves', name: 'Falling Autumn Leaves 🍂' },
  { id: 'snow_flakes', name: 'Gentle Snowflakes ❄️' },
  { id: 'golden_dust', name: 'Golden Sunlight Dust ✨' },
  { id: 'starfield', name: 'Twinkling Night Stars 🌌' },
  { id: 'bubbles', name: 'Floating Water Bubbles 🫧' },
  { id: 'sakura', name: 'Cherry Blossom Petals 🌸' },
  { id: 'rain', name: 'Soft Window Rain 🌧️' },
  { id: 'fireflies', name: 'Enchanted Fireflies 💡' },
];

type MainNavGroup =
  | 'book_info'
  | 'design'
  | 'themes'
  | 'navigate'
  | 'logo'
  | 'profile'
  | 'share_social'
  | 'embed'
  | 'download'
  | 'monetize'
  | 'visibility'
  | 'statistics'
  | 'accessibility';

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

  // Active section state
  const [activeNav, setActiveNav] = useState<MainNavGroup>('design');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    customize: true,
    branding: true,
    share: true,
    monetize: false,
  });

  const toggleGroup = (grp: string) => {
    setOpenGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  // Design Sub-tabs
  const [designTab, setDesignTab] = useState<'colors' | 'basic' | 'toolbar'>('colors');
  // Themes Sub-tabs
  const [themesTab, setThemesTab] = useState<'layouts' | 'presets' | 'effects'>('presets');
  const [layoutDevice, setLayoutDevice] = useState<'pc' | 'mobile'>('pc');
  const [layoutSearch, setLayoutSearch] = useState('');

  // Accordion open/close state within Design -> Basic
  const [basicAccordions, setBasicAccordions] = useState<Record<string, boolean>>({
    general: true,
    preloader: false,
    display: false,
    shadow: false,
    cover: false,
    appearance: false,
    page_number: false,
    margins: false,
    watermark: false,
    google: false,
    chatbot: false,
    accessibility: false,
  });

  const toggleBasicAccordion = (key: string) => {
    setBasicAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 1. Book Info
  const [companyName, setCompanyName] = useState(current.companyName ?? flipbook.title ?? '');
  const [catalogueSubtitle, setCatalogueSubtitle] = useState(current.catalogueSubtitle ?? '');
  const [disclaimerTitle, setDisclaimerTitle] = useState(current.disclaimerTitle ?? 'Disclaimer');
  const [disclaimerText, setDisclaimerText] = useState(
    current.disclaimerText ?? (flipbook as any).description ?? ''
  );
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(current.showDisclaimer ?? false);
  const [privateNotes, setPrivateNotes] = useState(current.privateNotes ?? '');

  // 2. Logo (Image 1)
  const [customLogoUrl, setCustomLogoUrl] = useState(current.customLogoUrl || '');
  const [logoTargetUrl, setLogoTargetUrl] = useState(current.logoTargetUrl || '');
  const [openLogoIn, setOpenLogoIn] = useState<'new_tab' | 'current_window' | 'none'>(
    current.openLogoIn || 'new_tab'
  );
  const [logoLeftPadding, setLogoLeftPadding] = useState<number>(current.logoLeftPadding ?? 10);
  const [logoTopPadding, setLogoTopPadding] = useState<number>(current.logoTopPadding ?? 0);
  const [logoHeight, setLogoHeight] = useState<number>(current.logoHeight ?? 42);
  const [faviconUrl, setFaviconUrl] = useState(current.faviconUrl || '');

  // 3. Profile (Image 5)
  const [showProfileButton, setShowProfileButton] = useState<boolean>(current.showProfileButton ?? false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(current.profileAvatarUrl || '');
  const [profileAuthor, setProfileAuthor] = useState(current.profileAuthor || '');
  const [profileEmail, setProfileEmail] = useState(current.profileEmail || '');
  const [profileUrl, setProfileUrl] = useState(current.profileUrl || '');
  const [profilePhone, setProfilePhone] = useState(current.profilePhone || '');
  const [profileAddress, setProfileAddress] = useState(current.profileAddress || '');
  const [profileDescription, setProfileDescription] = useState(current.profileDescription || '');

  // 4. Design -> General Settings (Image 7)
  const [prevNextShortcut, setPrevNextShortcut] = useState<boolean>(current.prevNextShortcut ?? true);
  const [prevNextColor, setPrevNextColor] = useState(current.prevNextColor || '#ffffff');
  const [prevNextHoverColor, setPrevNextHoverColor] = useState(current.prevNextHoverColor || '#f5c542');
  const [prevNextBg, setPrevNextBg] = useState(current.prevNextBg || '#1e293b');
  const [prevNextHoverBg, setPrevNextHoverBg] = useState(current.prevNextHoverBg || '#0f172a');
  const [prevNextMobile, setPrevNextMobile] = useState<boolean>(current.prevNextMobile ?? true);
  const [firstLastPagePrompt, setFirstLastPagePrompt] = useState<boolean>(current.firstLastPagePrompt ?? true);
  const [rightClickMenu, setRightClickMenu] = useState<boolean>(current.rightClickMenu ?? true);
  const [pageNumberInUrl, setPageNumberInUrl] = useState<boolean>(current.pageNumberInUrl ?? true);

  // 5. Design -> Preloader Settings (Image 4)
  const [loadingText, setLoadingText] = useState(current.loadingText || 'Loading');
  const [loadingFontSize, setLoadingFontSize] = useState<number>(current.loadingFontSize ?? 20);
  const [loadingFontColor, setLoadingFontColor] = useState(current.loadingFontColor || '#e2e8f0');
  const [showLoadingAnimation, setShowLoadingAnimation] = useState<boolean>(current.showLoadingAnimation ?? true);
  const [loadingImageUrl, setLoadingImageUrl] = useState(current.loadingImageUrl || '');
  const [loadingImageHeight, setLoadingImageHeight] = useState<number>(current.loadingImageHeight ?? 150);
  const [loadingBgColor, setLoadingBgColor] = useState(current.loadingBgColor || '#18191c');
  const [minLoadingTime, setMinLoadingTime] = useState<number>(current.minLoadingTime ?? 0);
  const [loadingVideoUrl, setLoadingVideoUrl] = useState(current.loadingVideoUrl || '');

  // 6. Design -> Display Settings (Image 2)
  const [showQrCode, setShowQrCode] = useState<boolean>(current.showQrCode ?? false);
  const [centerBook, setCenterBook] = useState<boolean>(current.centerBook ?? true);
  const [sharpenPages, setSharpenPages] = useState<boolean>(current.sharpenPages ?? true);
  const [rememberLastPage, setRememberLastPage] = useState<boolean>(current.rememberLastPage ?? true);
  const [initialNavPanel, setInitialNavPanel] = useState<'none' | 'thumbnails' | 'toc' | 'bookmarks'>(
    current.initialNavPanel || 'none'
  );
  const [hardCover, setHardCover] = useState<boolean>(current.hardCover ?? false);
  const [shadowDepth, setShadowDepth] = useState<number>(current.shadowDepth ?? 85);
  const [pageCornerRadius, setPageCornerRadius] = useState<number>(current.pageCornerRadius ?? 4);

  // 7. Design -> Toolbar Settings (Image 8)
  const [showToolbar, setShowToolbar] = useState<boolean>(current.showToolbar ?? true);
  const [alwaysShowToolbarPc, setAlwaysShowToolbarPc] = useState<boolean>(current.alwaysShowToolbarPc ?? true);
  const [alwaysShowToolbarMobile, setAlwaysShowToolbarMobile] = useState<boolean>(current.alwaysShowToolbarMobile ?? false);
  const [toolbarColor, setToolbarColor] = useState(current.toolbarColor || '#18191c');
  const [toolbarOpacity, setToolbarOpacity] = useState<number>(current.toolbarOpacity ?? 1.0);
  const [toolbarButtonColor, setToolbarButtonColor] = useState(current.toolbarButtonColor || '#cbd5e1');
  const [toolbarFontColor, setToolbarFontColor] = useState(current.toolbarFontColor || '#ffffff');
  const [pageNumberFontColor, setPageNumberFontColor] = useState(current.pageNumberFontColor || '#94a3b8');
  const [panelBgColor, setPanelBgColor] = useState(current.panelBgColor || '#111215');
  const [panelOpacity, setPanelOpacity] = useState<number>(current.panelOpacity ?? 1.0);
  const [panelFontColor, setPanelFontColor] = useState(current.panelFontColor || '#ffffff');

  // 7b. Color & Theme Studio (TOC Drawer, Nav Pill, Brand Accent & Gradients)
  const [brandAccentColor, setBrandAccentColor] = useState(current.brandAccentColor || '#f59e0b');
  const [drawerBgColor, setDrawerBgColor] = useState(current.drawerBgColor || current.panelBgColor || '#0d1117');
  const [drawerHeaderBgColor, setDrawerHeaderBgColor] = useState(current.drawerHeaderBgColor || '#161b22');
  const [drawerTextColor, setDrawerTextColor] = useState(current.drawerTextColor || current.panelFontColor || '#f1f5f9');
  const [drawerActiveColor, setDrawerActiveColor] = useState(current.drawerActiveColor || current.brandAccentColor || '#f59e0b');
  const [drawerActiveTextColor, setDrawerActiveTextColor] = useState(current.drawerActiveTextColor || '#0f172a');
  const [headerBgColor, setHeaderBgColor] = useState(current.headerBgColor || current.toolbarColor || '#0f172a');
  const [headerTextColor, setHeaderTextColor] = useState(current.headerTextColor || current.toolbarButtonColor || '#ffffff');
  const [navPillBgColor, setNavPillBgColor] = useState(current.navPillBgColor || current.toolbarColor || '#111827');
  const [navPillTextColor, setNavPillTextColor] = useState(current.navPillTextColor || current.toolbarButtonColor || '#ffffff');
  const [hotspotHighlightColor, setHotspotHighlightColor] = useState(current.hotspotHighlightColor || current.brandAccentColor || '#f59e0b');
  const [backgroundGradient, setBackgroundGradient] = useState(current.backgroundGradient || '');
  const [gradientStart, setGradientStart] = useState('#0f172a');
  const [gradientEnd, setGradientEnd] = useState('#1e293b');
  const [gradientAngle, setGradientAngle] = useState('135deg');
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState<number | null>(null);
  const [brandKitFeedback, setBrandKitFeedback] = useState<string>('');

  useEffect(() => {
    api<{ brandKits: any[] }>('/brand-kits')
      .then((res) => {
        if (res?.brandKits) setBrandKits(res.brandKits);
      })
      .catch(() => {});
  }, []);

  // Controls buttons
  const [allowDownload, setAllowDownload] = useState<boolean>(current.allowDownload ?? false);
  const [showThumbnailsButton, setShowThumbnailsButton] = useState<boolean>(current.showThumbnailsButton ?? true);
  const [showSearchButton, setShowSearchButton] = useState<boolean>(current.showSearchButton ?? true);
  const [showShareButton, setShowShareButton] = useState<boolean>(current.showShareButton ?? true);
  const [showFullscreenButton, setShowFullscreenButton] = useState<boolean>(current.showFullscreenButton ?? true);
  const [showAutoFlipButton, setShowAutoFlipButton] = useState<boolean>(current.showAutoFlipButton ?? false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(current.soundEnabled ?? true);
  const [showPoweredBy, setShowPoweredBy] = useState<boolean>(current.showPoweredBy ?? true);
  const [brandText, setBrandText] = useState(current.brandText || '');

  // 8. Themes (Images 3 & 9)
  const [presetSkinId, setPresetSkinId] = useState(current.presetSkinId || 'classical');
  const [layoutTemplateId, setLayoutTemplateId] = useState(current.layoutTemplateId || 'popular');
  const [backgroundEffect, setBackgroundEffect] = useState(current.backgroundEffect || 'none');
  const [background, setBackground] = useState(current.background || '#1e293b');
  const [backgroundImage, setBackgroundImage] = useState(current.backgroundImage || '');
  const [backgroundType, setBackgroundType] = useState<'image' | 'color' | 'style'>(current.backgroundType || 'color');

  // 9. Navigate (Page Flip Effects)
  const [pageEffect, setPageEffect] = useState<PageEffectType>(current.pageEffect || 'magazine');
  const [horizontalTurn, setHorizontalTurn] = useState<boolean>(current.horizontalTurn ?? true);
  const [rightToLeft, setRightToLeft] = useState<boolean>(current.rightToLeft ?? false);
  const [defaultReadingMode, setDefaultReadingMode] = useState<'flip' | 'scroll' | 'reader'>(
    current.defaultReadingMode || 'flip'
  );

  // 10. Watermark Settings
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(current.watermarkEnabled ?? false);
  const [watermarkText, setWatermarkText] = useState(current.watermarkText || 'CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(current.watermarkOpacity ?? 15);
  const [watermarkAngle, setWatermarkAngle] = useState<number>(current.watermarkAngle ?? -30);

  // 11. Google Tools & AI Chatbot
  const [gaTrackingId, setGaTrackingId] = useState(current.gaTrackingId || '');
  const [gtmContainerId, setGtmContainerId] = useState(current.gtmContainerId || '');
  const [aiChatbotEnabled, setAiChatbotEnabled] = useState<boolean>(current.aiChatbotEnabled ?? false);
  const [aiBotName, setAiBotName] = useState(current.aiBotName || 'Flipex AI Assistant');
  const [aiWelcomeMessage, setAiWelcomeMessage] = useState(
    current.aiWelcomeMessage || 'Hello! Ask me any questions about this document.'
  );

  // 12. Share & Embed (Images 6 & 10)
  const [embedTab, setEmbedTab] = useState<'iframe' | 'wordpress' | 'popup'>('iframe');
  const [embedSize, setEmbedSize] = useState<'responsive' | '400x250' | '700x400' | '900x500' | 'custom'>('responsive');
  const [embedCustomW, setEmbedCustomW] = useState('800');
  const [embedCustomH, setEmbedCustomH] = useState('500');
  const [embedStartPage, setEmbedStartPage] = useState('1');
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Background Audio
  const [bgAudioUrl, setBgAudioUrl] = useState(current.bgAudioUrl || '');
  const [bgAudioAutoplay, setBgAudioAutoplay] = useState<boolean>(current.bgAudioAutoplay ?? false);
  const [bgAudioLoop, setBgAudioLoop] = useState<boolean>(current.bgAudioLoop ?? true);

  const [saving, setSaving] = useState(false);
  const [saveAsBrandKit, setSaveAsBrandKit] = useState(true);
  const [msg, setMsg] = useState('');

  const publicUrl = `${window.location.origin}/v/${flipbook.slug}`;

  // Image Upload Helper (converts to base64 data url for instant live preview and persistence)
  const handleImageFile = (
    e: ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Generate Embed Snippet
  const getEmbedCode = () => {
    const pageParam = parseInt(embedStartPage, 10) > 1 ? `?page=${embedStartPage}` : '';
    const src = `${publicUrl}${pageParam}`;
    if (embedTab === 'wordpress') {
      const w = embedSize === 'custom' ? embedCustomW : embedSize === '400x250' ? '400' : '100%';
      const h = embedSize === 'custom' ? embedCustomH : embedSize === '400x250' ? '250' : '600';
      return `[nuvis_flipex slug="${flipbook.slug}" width="${w}" height="${h}"]`;
    }
    if (embedTab === 'popup') {
      return `<button onclick="window.open('${src}', 'flipbook', 'width=1100,height=750')">Read ${companyName || flipbook.title}</button>`;
    }
    // Iframe responsive or fixed
    if (embedSize === 'responsive') {
      return `<div style="position:relative;padding-top:max(60%,324px);width:100%;height:0;"><iframe style="position:absolute;border:none;width:100%;height:100%;left:0;top:0;" src="${src}" title="${companyName || flipbook.title}" allowfullscreen="true" allow="autoplay; clipboard-write"></iframe></div>`;
    }
    const [w, h] =
      embedSize === 'custom'
        ? [embedCustomW, embedCustomH]
        : embedSize === '400x250'
          ? ['400', '250']
          : embedSize === '700x400'
            ? ['700', '400']
            : ['900', '500'];
    return `<iframe src="${src}" width="${w}" height="${h}" style="border:none;" allowfullscreen="true"></iframe>`;
  };

  const copyEmbedCode = () => {
    navigator.clipboard?.writeText(getEmbedCode()).then(() => {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2200);
    });
  };

  const copyBookLink = () => {
    navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    });
  };

  // Apply a preset skin with full harmonization
  const applyPresetSkin = (skin: any) => {
    setPresetSkinId(skin.id);
    setBackground(skin.bg);
    setBackgroundType(skin.bg.includes('gradient') ? 'style' : 'color');
    setToolbarColor(skin.toolbar);
    setToolbarButtonColor(skin.btn);
    setToolbarFontColor(skin.btn);
    if (skin.accent) setBrandAccentColor(skin.accent);
    if (skin.drawerBg) setDrawerBgColor(skin.drawerBg);
    if (skin.drawerHeader) setDrawerHeaderBgColor(skin.drawerHeader);
    if (skin.drawerText) setDrawerTextColor(skin.drawerText);
    if (skin.drawerActive) setDrawerActiveColor(skin.drawerActive);
    if (skin.drawerActiveText) setDrawerActiveTextColor(skin.drawerActiveText);
    if (skin.toolbar) {
      setHeaderBgColor(skin.toolbar);
      setNavPillBgColor(skin.toolbar);
    }
    if (skin.btn) {
      setHeaderTextColor(skin.btn);
      setNavPillTextColor(skin.btn);
    }
  };

  const applyCustomGradient = (start: string, end: string, angle: string) => {
    const grad = `linear-gradient(${angle}, ${start} 0%, ${end} 100%)`;
    setBackground(grad);
    setBackgroundGradient(grad);
    setBackgroundType('style');
  };

  const applyBrandKit = (kit: any) => {
    if (!kit) return;
    if (kit.accentColor) setBrandAccentColor(kit.accentColor);
    if (kit.secondaryColor) {
      setToolbarColor(kit.secondaryColor);
      setHeaderBgColor(kit.secondaryColor);
      setNavPillBgColor(kit.secondaryColor);
    }
    if (kit.primaryColor) {
      setToolbarButtonColor(kit.primaryColor);
      setHeaderTextColor(kit.primaryColor);
      setNavPillTextColor(kit.primaryColor);
    }
    if (kit.drawerBgColor) setDrawerBgColor(kit.drawerBgColor);
    if (kit.drawerTextColor) setDrawerTextColor(kit.drawerTextColor);
    if (kit.accentColor) setDrawerActiveColor(kit.accentColor);
    if (kit.backgroundGradient) {
      setBackground(kit.backgroundGradient);
      setBackgroundGradient(kit.backgroundGradient);
      setBackgroundType('style');
    }
    setBrandKitFeedback(`Applied ${kit.name}!`);
    setTimeout(() => setBrandKitFeedback(''), 3000);
  };

  const handleSaveBrandKit = async () => {
    try {
      const kitName = `${companyName || 'Workspace'} Custom Palette`;
      const res = await api<{ brandKit: any }>('/brand-kits', 'POST', {
        name: kitName,
        primaryColor: brandAccentColor,
        secondaryColor: toolbarColor,
        accentColor: brandAccentColor,
        backgroundGradient: background.includes('gradient') ? background : undefined,
        drawerBgColor,
        drawerTextColor,
        isDefault: false,
      });
      if (res?.brandKit) {
        setBrandKits((prev) => [...prev, res.brandKit]);
        setBrandKitFeedback(`Saved as "${kitName}"!`);
        setTimeout(() => setBrandKitFeedback(''), 3500);
      }
    } catch {
      setBrandKitFeedback('Failed to save Brand Kit');
      setTimeout(() => setBrandKitFeedback(''), 3500);
    }
  };

  // Save Settings to Backend (isolated per tenant)
  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const cleanTitle = companyName.trim() || flipbook.title || 'Untitled Flipbook';
      const updatedSettings: FlipbookSettings = {
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
        backgroundType,
        backgroundImage,
        presetSkinId,
        layoutTemplateId,
        backgroundEffect,
        customLogoUrl,
        logoTargetUrl,
        openLogoIn,
        logoLeftPadding,
        logoTopPadding,
        logoHeight,
        faviconUrl,
        showPoweredBy,
        brandText,
        showProfileButton,
        profileAvatarUrl,
        profileAuthor,
        profileEmail,
        profileUrl,
        profilePhone,
        profileAddress,
        profileDescription,
        prevNextShortcut,
        prevNextColor,
        prevNextHoverColor,
        prevNextBg,
        prevNextHoverBg,
        prevNextMobile,
        firstLastPagePrompt,
        rightClickMenu,
        pageNumberInUrl,
        loadingText,
        loadingFontSize,
        loadingFontColor,
        showLoadingAnimation,
        loadingImageUrl,
        loadingImageHeight,
        loadingBgColor,
        minLoadingTime,
        loadingVideoUrl,
        showQrCode,
        centerBook,
        sharpenPages,
        rememberLastPage,
        initialNavPanel,
        hardCover,
        shadowDepth,
        pageCornerRadius,
        showToolbar,
        alwaysShowToolbarPc,
        alwaysShowToolbarMobile,
        toolbarColor,
        toolbarOpacity,
        toolbarButtonColor,
        toolbarFontColor,
        pageNumberFontColor,
        panelBgColor,
        panelOpacity,
        panelFontColor,
        brandAccentColor,
        drawerBgColor,
        drawerHeaderBgColor,
        drawerTextColor,
        drawerActiveColor,
        drawerActiveTextColor,
        headerBgColor,
        headerTextColor,
        navPillBgColor,
        navPillTextColor,
        hotspotHighlightColor,
        backgroundGradient: background.includes('gradient') ? background : backgroundGradient,
        allowDownload,
        showThumbnailsButton,
        showSearchButton,
        showShareButton,
        showFullscreenButton,
        showAutoFlipButton,
        watermarkEnabled,
        watermarkText,
        watermarkOpacity,
        watermarkAngle,
        gaTrackingId,
        gtmContainerId,
        aiChatbotEnabled,
        aiBotName,
        aiWelcomeMessage,
        bgAudioUrl,
        bgAudioAutoplay,
        bgAudioLoop,
      };

      await api(`/flipbooks/${flipbook.id}`, 'PATCH', {
        title: cleanTitle,
        settings: updatedSettings,
        saveAsBrandKit,
      });

      flipbook.title = cleanTitle;
      setMsg(
        saveAsBrandKit
          ? 'Customizations & Workspace Default Brand Kit saved!'
          : 'Customizations saved successfully!'
      );
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    } catch (e: any) {
      setMsg(e.message || 'Failed to save customizations');
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal hz-studio-modal-overlay" onClick={onClose}>
      <div className="flipex-studio-modal" onClick={(e) => e.stopPropagation()}>
        {/* ====================================================================
            LEFT SLATE SIDEBAR (MATCHING FLIPHTML5 SCREENSHOTS 1, 6, 7)
            ==================================================================== */}
        <div className="flipex-studio-sidebar">
          <div className="flipex-studio-nav-list">
            {/* Book Info */}
            <button
              type="button"
              className={`flipex-nav-group-btn ${activeNav === 'book_info' ? 'active' : ''}`}
              onClick={() => setActiveNav('book_info')}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Book Info
              </span>
            </button>

            {/* Customize Group */}
            <div>
              <button
                type="button"
                className={`flipex-nav-group-btn ${
                  ['design', 'themes', 'navigate'].includes(activeNav) ? 'active' : ''
                }`}
                onClick={() => toggleGroup('customize')}
              >
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Customize
                </span>
                {openGroups.customize ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {openGroups.customize && (
                <div className="flipex-nav-sublist">
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'design' ? 'active' : ''}`}
                    onClick={() => setActiveNav('design')}
                  >
                    Design
                  </button>
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'themes' ? 'active' : ''}`}
                    onClick={() => setActiveNav('themes')}
                  >
                    Themes
                  </button>
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'navigate' ? 'active' : ''}`}
                    onClick={() => setActiveNav('navigate')}
                  >
                    Navigate
                  </button>
                </div>
              )}
            </div>

            {/* Branding Group (Image 1 & 5) */}
            <div>
              <button
                type="button"
                className={`flipex-nav-group-btn ${['logo', 'profile'].includes(activeNav) ? 'active' : ''}`}
                onClick={() => toggleGroup('branding')}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Branding
                </span>
                {openGroups.branding ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {openGroups.branding && (
                <div className="flipex-nav-sublist">
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'logo' ? 'active' : ''}`}
                    onClick={() => setActiveNav('logo')}
                  >
                    Logo
                  </button>
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveNav('profile')}
                  >
                    Profile
                  </button>
                </div>
              )}
            </div>

            {/* Share Group (Image 6 & 10) */}
            <div>
              <button
                type="button"
                className={`flipex-nav-group-btn ${
                  ['share_social', 'embed', 'download'].includes(activeNav) ? 'active' : ''
                }`}
                onClick={() => toggleGroup('share')}
              >
                <span className="flex items-center gap-2">
                  <Share2 className="h-4 w-4" /> Share
                </span>
                {openGroups.share ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {openGroups.share && (
                <div className="flipex-nav-sublist">
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'share_social' ? 'active' : ''}`}
                    onClick={() => setActiveNav('share_social')}
                  >
                    Share on Social
                  </button>
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'embed' ? 'active' : ''}`}
                    onClick={() => setActiveNav('embed')}
                  >
                    Embed on Website
                  </button>
                  <button
                    type="button"
                    className={`flipex-nav-subitem ${activeNav === 'download' ? 'active' : ''}`}
                    onClick={() => setActiveNav('download')}
                  >
                    Download
                  </button>
                </div>
              )}
            </div>

            {/* Monetize */}
            <button
              type="button"
              className={`flipex-nav-group-btn ${activeNav === 'monetize' ? 'active' : ''}`}
              onClick={() => setActiveNav('monetize')}
            >
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" /> Monetize & Leads
              </span>
            </button>

            {/* Visibility */}
            <button
              type="button"
              className={`flipex-nav-group-btn ${activeNav === 'visibility' ? 'active' : ''}`}
              onClick={() => setActiveNav('visibility')}
            >
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Visibility
              </span>
            </button>

            {/* Statistics */}
            <button
              type="button"
              className={`flipex-nav-group-btn ${activeNav === 'statistics' ? 'active' : ''}`}
              onClick={() => setActiveNav('statistics')}
            >
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4" /> Statistics
              </span>
            </button>

            {/* Accessibility */}
            <button
              type="button"
              className={`flipex-nav-group-btn ${activeNav === 'accessibility' ? 'active' : ''}`}
              onClick={() => setActiveNav('accessibility')}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Accessibility
              </span>
            </button>
          </div>

          {/* Bottom Card: Add links/videos/images/etc -> Interactive Page Designer */}
          <div className="flipex-sidebar-promo-card">
            <div className="flipex-promo-icons">
              <span className="flipex-promo-dot bg-emerald-500" />
              <span className="flipex-promo-dot bg-rose-500" />
              <span className="flipex-promo-dot bg-blue-500" />
              <span className="flipex-promo-dot bg-amber-500" />
            </div>
            <span className="flipex-promo-text">Interactive Page Designer &amp; Enrichments Studio</span>
            <Link
              to={`/dashboard/editor/${flipbook.id}`}
              className="flipex-promo-btn"
              onClick={onClose}
            >
              <span>Open Page Designer</span> <span>→</span>
            </Link>
          </div>
        </div>

        {/* ====================================================================
            RIGHT CONTENT AREA
            ==================================================================== */}
        <div className="flipex-studio-main">
          {/* Top Header */}
          <div className="flipex-studio-topbar">
            <h3>
              {activeNav === 'book_info' && 'Book Information'}
              {activeNav === 'design' && 'Design Settings'}
              {activeNav === 'themes' && 'Themes, Layouts & Skins'}
              {activeNav === 'navigate' && 'Page Turn & Reading Mode'}
              {activeNav === 'logo' && 'Logo & Favicon Branding'}
              {activeNav === 'profile' && 'Author & Publisher Profile'}
              {activeNav === 'share_social' && 'Share on Social Media'}
              {activeNav === 'embed' && 'Embed Publication on Website'}
              {activeNav === 'download' && 'PDF Download Settings'}
              {activeNav === 'monetize' && 'Monetization & Lead Gates'}
              {activeNav === 'visibility' && 'Privacy & Visibility'}
              {activeNav === 'statistics' && 'Reader Analytics'}
              {activeNav === 'accessibility' && 'Accessibility Controls'}
            </h3>
            <button type="button" className="hz-studio-close-x" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Body Content */}
          <div className={`hz-studio-body ${activeNav === 'design' || activeNav === 'themes' ? 'hz-has-preview' : ''}`}>
            {(activeNav === 'design' || activeNav === 'themes') && (
              <aside className="hz-live-preview" aria-label="Live reader preview" data-testid="cust-live-preview">
                <div className="hz-lp-label">Live preview</div>
                <div className="hz-lp-reader" style={{ background }}>
                  <div className="hz-lp-header" style={{ background: headerBgColor, color: headerTextColor }}>
                    <span className="hz-lp-menu" style={{ background: headerTextColor }} />
                    <span className="hz-lp-title">{companyName || flipbook.title}</span>
                    <span className="hz-lp-dot" style={{ background: brandAccentColor }} />
                  </div>
                  <div className="hz-lp-stage">
                    <span className="hz-lp-arrow" style={{ background: prevNextBg, color: prevNextColor }}>‹</span>
                    <div className="hz-lp-spread">
                      <div className="hz-lp-page"><i /><i /><i className="short" /></div>
                      <div className="hz-lp-page"><b style={{ background: brandAccentColor }} /><i /><i className="short" /></div>
                    </div>
                    <span className="hz-lp-arrow" style={{ background: prevNextBg, color: prevNextColor }}>›</span>
                    <div className="hz-lp-drawer" style={{ background: drawerBgColor, color: drawerTextColor }}>
                      <div className="hz-lp-drawer-head" style={{ background: drawerHeaderBgColor }}>Contents</div>
                      <div className="hz-lp-drawer-row on" style={{ background: drawerActiveColor, color: drawerActiveTextColor }}>Cover</div>
                      <div className="hz-lp-drawer-row">Page 2</div>
                    </div>
                  </div>
                  <div className="hz-lp-toolbar" style={{ background: toolbarColor, opacity: Math.max(0.5, toolbarOpacity), color: toolbarFontColor }}>
                    {['⌕', '☰', '⤢', '⇩'].map((g) => (
                      <span key={g} style={{ color: toolbarButtonColor }}>{g}</span>
                    ))}
                    <span className="hz-lp-pageno" style={{ color: pageNumberFontColor }}>1 / {flipbook.pageCount ?? 1}</span>
                  </div>
                </div>
                <p className="hz-lp-note">Updates as you change colours and themes. Save to apply to the public reader.</p>
              </aside>
            )}
            {/* ==================== 1. BRANDING -> LOGO (IMAGE 1) ==================== */}
            {activeNav === 'logo' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    <span>Logo</span> <span className="text-amber-500">👑</span>
                  </h4>
                  <div className="flipex-upload-dropzone">
                    <label className="flipex-dropzone-box">
                      {customLogoUrl ? (
                        <img src={customLogoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <Upload className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-[10px]">Upload</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleImageFile(e, setCustomLogoUrl)}
                      />
                    </label>
                    <div className="flipex-dropzone-guidelines">
                      <span><b>Format:</b> JPG/JPEG, PNG, SVG</span>
                      <span><b>Dimensions:</b> 140*42px (suggested) · 500*500px (maximum)</span>
                      {customLogoUrl && (
                        <button
                          type="button"
                          className="text-xs text-red-500 text-left font-medium hover:underline mt-1"
                          onClick={() => setCustomLogoUrl('')}
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="card space-y-4 p-4">
                    <div className="field">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Logo URL (Destination Link)</label>
                      <input
                        type="url"
                        className="hz-form-input"
                        placeholder="https://yourcompany.com"
                        value={logoTargetUrl}
                        onChange={(e) => setLogoTargetUrl(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="field">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Open Logo In</label>
                        <select
                          className="hz-form-select"
                          value={openLogoIn}
                          onChange={(e) => setOpenLogoIn(e.target.value as any)}
                        >
                          <option value="new_tab">New Tab</option>
                          <option value="current_window">Current Window</option>
                          <option value="none">None (Disabled)</option>
                        </select>
                      </div>

                      <div className="field">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Logo Height (px)</label>
                        <input
                          type="number"
                          className="hz-form-input"
                          min="16"
                          max="120"
                          value={logoHeight}
                          onChange={(e) => setLogoHeight(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="field">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Left Padding (px)</label>
                        <input
                          type="number"
                          className="hz-form-input"
                          min="0"
                          max="100"
                          value={logoLeftPadding}
                          onChange={(e) => setLogoLeftPadding(Number(e.target.value))}
                        />
                      </div>

                      <div className="field">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Top Padding (px)</label>
                        <input
                          type="number"
                          className="hz-form-input"
                          min="0"
                          max="100"
                          value={logoTopPadding}
                          onChange={(e) => setLogoTopPadding(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Favicon (Image 1 Bottom) */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    <span>Favicon</span> <span className="text-amber-500">👑</span>
                  </h4>
                  <div className="flipex-upload-dropzone">
                    <label className="flipex-dropzone-box">
                      {faviconUrl ? (
                        <img src={faviconUrl} alt="Favicon" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <Upload className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-[10px]">Favicon</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/png, image/x-icon, image/jpeg"
                        className="hidden"
                        onChange={(e) => handleImageFile(e, setFaviconUrl)}
                      />
                    </label>
                    <div className="flipex-dropzone-guidelines">
                      <span><b>Format:</b> JPG/JPEG, PNG, ICO</span>
                      <span><b>Dimensions:</b> 100*100px (maximum) · 10MB (maximum)</span>
                      {faviconUrl && (
                        <button
                          type="button"
                          className="text-xs text-red-500 text-left font-medium hover:underline mt-1"
                          onClick={() => setFaviconUrl('')}
                        >
                          Remove Favicon
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 2. BRANDING -> PROFILE (IMAGE 5) ==================== */}
            {activeNav === 'profile' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Add Profile Button</span>
                    <span className="text-amber-500 text-xs">👑</span>
                  </div>
                  <label className="hz-switch-row">
                    <input
                      type="checkbox"
                      checked={showProfileButton}
                      onChange={(e) => setShowProfileButton(e.target.checked)}
                    />
                    <span className="hz-switch-slider" />
                  </label>
                </div>

                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                  ℹ️ Create one unique and detailed profile to let your readers know more about you or your organization.
                </div>

                <div className="flipex-upload-dropzone">
                  <label className="flipex-dropzone-box">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt="Avatar" className="w-full h-full object-contain p-2" />
                    ) : (
                      <div className="text-center p-2 text-slate-400">
                        <Upload className="h-5 w-5 mx-auto mb-1" />
                        <span className="text-[10px]">Photo</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageFile(e, setProfileAvatarUrl)}
                    />
                  </label>
                  <div className="flipex-dropzone-guidelines">
                    <span><b>Format:</b> JPG/JPEG, PNG</span>
                    <span><b>Dimensions:</b> 150*30px (suggested) · 500*500px (maximum)</span>
                  </div>
                </div>

                <div className="card space-y-3.5 p-4">
                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Author / Publisher</label>
                    <input
                      type="text"
                      className="hz-form-input"
                      placeholder="e.g. Mannat Investments Pte Ltd"
                      value={profileAuthor}
                      onChange={(e) => setProfileAuthor(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="field">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
                      <input
                        type="email"
                        className="hz-form-input"
                        placeholder="nilesh@nuvistechnologies.com.fj"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Phone</label>
                      <input
                        type="tel"
                        className="hz-form-input"
                        placeholder="+679 1234567"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Website URL</label>
                    <input
                      type="url"
                      className="hz-form-input"
                      placeholder="https://shop.nuvistechnologies.com.fj"
                      value={profileUrl}
                      onChange={(e) => setProfileUrl(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Address</label>
                    <input
                      type="text"
                      className="hz-form-input"
                      placeholder="Suva, Fiji Islands"
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description / Bio</label>
                    <textarea
                      rows={3}
                      className="hz-form-textarea"
                      placeholder="About the publisher or business..."
                      value={profileDescription}
                      onChange={(e) => setProfileDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 3. CUSTOMIZE -> DESIGN (IMAGES 2, 4, 7, 8) ==================== */}
            {activeNav === 'design' && (
              <div>
                {/* Segmented Sub-Tabs: Color & Theme Studio | Basic Settings | ToolBar Settings */}
                <TabBar
                  variant="segment"
                  ariaLabel="Design settings"
                  testId="design-subtabs"
                  className="mb-4"
                  value={designTab}
                  onChange={(id) => setDesignTab(id as any)}
                  tabs={[
                    { id: 'colors', label: 'Color & Theme Studio', icon: 'palette' },
                    { id: 'basic', label: 'Basic Settings', icon: 'sliders' },
                    { id: 'toolbar', label: 'ToolBar Settings', icon: 'menu' },
                  ]}
                />

                {designTab === 'colors' ? (
                  <div className="space-y-4">
                    {/* 1. Curated 1-Click Themes Grid */}
                    <div className="card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider m-0">
                            <StudioIcon name="palette" size={15} /> Curated 1-Click Themes
                          </h4>
                          <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                            Harmonizes reader background, contents drawer, header &amp; highlights instantly.
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {PRESET_SKINS.length} Themes
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                        {PRESET_SKINS.map((skin) => {
                          const isSel = presetSkinId === skin.id;
                          return (
                            <button
                              key={skin.id}
                              type="button"
                              onClick={() => applyPresetSkin(skin)}
                              className={`flex flex-col text-left rounded-xl p-2.5 border transition-all ${
                                isSel
                                  ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20'
                                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div
                                className="h-10 w-full rounded-lg mb-2 relative overflow-hidden shadow-inner flex items-center justify-between px-2"
                                style={{ background: skin.bg }}
                              >
                                <span
                                  className="h-6 w-10 rounded border shadow-sm flex items-center justify-center text-[9px] font-bold"
                                  style={{
                                    background: (skin as any).drawerBg || skin.toolbar,
                                    color: (skin as any).drawerText || skin.btn,
                                  }}
                                >
                                  TOC
                                </span>
                                <span
                                  className="h-3.5 w-3.5 rounded-full shadow"
                                  style={{ background: (skin as any).accent || '#f59e0b' }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {skin.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Workspace Brand Kit Integration */}
                    <div className="card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider m-0 flex items-center gap-2">
                          <StudioIcon name="layers" size={15} /> Workspace Brand Kits
                        </h4>
                        {brandKitFeedback && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {brandKitFeedback}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          className="hz-form-select flex-1 text-xs"
                          value={selectedBrandKitId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setSelectedBrandKitId(val);
                            if (val) {
                              const found = brandKits.find((k) => k.id === val);
                              if (found) applyBrandKit(found);
                            }
                          }}
                        >
                          <option value="">Select saved brand kit...</option>
                          {brandKits.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.name} {k.isDefault ? '(Default)' : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1.5 px-3"
                          onClick={handleSaveBrandKit}
                          title="Save current palette as a reusable Brand Kit for this workspace"
                        >
                          Save as Brand Kit
                        </button>
                      </div>
                    </div>

                    {/* 3. Custom Linear Gradient & Solid Background Studio */}
                    <div className="card p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider m-0">
                        🌅 Custom Canvas Background &amp; Gradients
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">
                        Design a multi-stop color blend or solid shade for the reader viewing stage.
                      </p>

                      <div className="flex items-center gap-3 pt-1">
                        <div
                          className="h-12 w-24 rounded-xl border border-slate-300 dark:border-slate-700 shadow-inner shrink-0"
                          style={{ background: background }}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flipex-color-row !p-1.5">
                              <span className="text-[11px]">Start Color</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={gradientStart}
                                onChange={(e) => {
                                  setGradientStart(e.target.value);
                                  applyCustomGradient(e.target.value, gradientEnd, gradientAngle);
                                }}
                              />
                            </div>
                            <div className="flipex-color-row !p-1.5">
                              <span className="text-[11px]">End Color</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={gradientEnd}
                                onChange={(e) => {
                                  setGradientEnd(e.target.value);
                                  applyCustomGradient(gradientStart, e.target.value, gradientAngle);
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400">Angle:</span>
                            {['135deg', '180deg', '90deg', '45deg', '0deg'].map((ang) => (
                              <button
                                key={ang}
                                type="button"
                                onClick={() => {
                                  setGradientAngle(ang);
                                  applyCustomGradient(gradientStart, gradientEnd, ang);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  gradientAngle === ang
                                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {ang}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. Side Drawer (TOC & Bookmarks) Custom Colors */}
                    <div className="card p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider m-0">
                        📑 Side Drawer (Contents &amp; Bookmarks)
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">
                        Tailor the exact look of your slide-out index to match your brand identity.
                      </p>

                      <div className="space-y-2 pt-1">
                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Drawer Background</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{drawerBgColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={drawerBgColor.startsWith('#') ? drawerBgColor : '#0d1117'}
                              onChange={(e) => setDrawerBgColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Header &amp; Tabs Background</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{drawerHeaderBgColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={drawerHeaderBgColor.startsWith('#') ? drawerHeaderBgColor : '#161b22'}
                              onChange={(e) => setDrawerHeaderBgColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Drawer Text Color</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{drawerTextColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={drawerTextColor.startsWith('#') ? drawerTextColor : '#f1f5f9'}
                              onChange={(e) => setDrawerTextColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Active Row Highlight</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{drawerActiveColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={drawerActiveColor.startsWith('#') ? drawerActiveColor : '#f59e0b'}
                              onChange={(e) => setDrawerActiveColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Active Page Badge Text</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{drawerActiveTextColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={drawerActiveTextColor.startsWith('#') ? drawerActiveTextColor : '#0f172a'}
                              onChange={(e) => setDrawerActiveTextColor(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 5. Brand Accent, Headers & Navigation Bar */}
                    <div className="card p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider m-0">
                        ⚡ Brand Accent &amp; Reader Bars
                      </h4>

                      <div className="space-y-2 pt-1">
                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Primary Brand Accent</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{brandAccentColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={brandAccentColor.startsWith('#') ? brandAccentColor : '#f59e0b'}
                              onChange={(e) => setBrandAccentColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Top Header Bar Background</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{headerBgColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={headerBgColor.startsWith('#') ? headerBgColor : '#0f172a'}
                              onChange={(e) => setHeaderBgColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Bottom Navigation Pill Background</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{navPillBgColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={navPillBgColor.startsWith('#') ? navPillBgColor : '#111827'}
                              onChange={(e) => setNavPillBgColor(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flipex-color-row">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Hotspot Glow &amp; Border Tint</span>
                          <div className="flipex-color-picker-wrap">
                            <span className="flipex-color-hex">{hotspotHighlightColor}</span>
                            <input
                              type="color"
                              className="flipex-color-input"
                              value={hotspotHighlightColor.startsWith('#') ? hotspotHighlightColor : '#f59e0b'}
                              onChange={(e) => setHotspotHighlightColor(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : designTab === 'basic' ? (
                  <div className="space-y-3">
                    {/* General Settings Accordion (Image 7) */}
                    <div className={`flipex-accordion-card ${basicAccordions.general ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="flipex-accordion-header"
                        onClick={() => toggleBasicAccordion('general')}
                      >
                        <span className="flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-amber-500" /> General Settings
                        </span>
                        {basicAccordions.general ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {basicAccordions.general && (
                        <div className="flipex-accordion-body">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Prev/Next Page Shortcut</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={prevNextShortcut}
                                onChange={(e) => setPrevNextShortcut(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flipex-color-row">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Shortcut Color</span>
                            <div className="flipex-color-picker-wrap">
                              <span className="flipex-color-hex">{prevNextColor}</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={prevNextColor}
                                onChange={(e) => setPrevNextColor(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flipex-color-row">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Shortcut Hover Color</span>
                            <div className="flipex-color-picker-wrap">
                              <span className="flipex-color-hex">{prevNextHoverColor}</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={prevNextHoverColor}
                                onChange={(e) => setPrevNextHoverColor(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flipex-color-row">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Shortcut Background Color</span>
                            <div className="flipex-color-picker-wrap">
                              <span className="flipex-color-hex">{prevNextBg}</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={prevNextBg}
                                onChange={(e) => setPrevNextBg(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Prev/Next Shortcut on Mobile</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={prevNextMobile}
                                onChange={(e) => setPrevNextMobile(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">First/Last Page Prompt</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={firstLastPagePrompt}
                                onChange={(e) => setFirstLastPagePrompt(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Right-Click to Show Menu of the Book</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={rightClickMenu}
                                onChange={(e) => setRightClickMenu(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Page Number In URL (hash sync)</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={pageNumberInUrl}
                                onChange={(e) => setPageNumberInUrl(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Preloader Settings Accordion (Image 4) */}
                    <div className={`flipex-accordion-card ${basicAccordions.preloader ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="flipex-accordion-header"
                        onClick={() => toggleBasicAccordion('preloader')}
                      >
                        <span className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-amber-500" /> Preloader Settings
                        </span>
                        {basicAccordions.preloader ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {basicAccordions.preloader && (
                        <div className="flipex-accordion-body">
                          <div className="field">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Loading Text</label>
                            <input
                              type="text"
                              className="hz-form-input"
                              placeholder="Loading..."
                              value={loadingText}
                              onChange={(e) => setLoadingText(e.target.value)}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Loading Font Size</span>
                            <div className="flipex-stepper-box">
                              <button
                                type="button"
                                className="flipex-stepper-btn"
                                onClick={() => setLoadingFontSize((v) => Math.max(12, v - 2))}
                              >
                                −
                              </button>
                              <span className="flipex-stepper-value">{loadingFontSize}</span>
                              <button
                                type="button"
                                className="flipex-stepper-btn"
                                onClick={() => setLoadingFontSize((v) => Math.min(48, v + 2))}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="flipex-color-row">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Loading Font Color</span>
                            <div className="flipex-color-picker-wrap">
                              <span className="flipex-color-hex">{loadingFontColor}</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={loadingFontColor}
                                onChange={(e) => setLoadingFontColor(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Show Loading Animation</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={showLoadingAnimation}
                                onChange={(e) => setShowLoadingAnimation(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flipex-color-row">
                            <span className="text-xs text-slate-600 dark:text-slate-400">Loading Background Color</span>
                            <div className="flipex-color-picker-wrap">
                              <span className="flipex-color-hex">{loadingBgColor}</span>
                              <input
                                type="color"
                                className="flipex-color-input"
                                value={loadingBgColor}
                                onChange={(e) => setLoadingBgColor(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Min Loading Time (sec)</span>
                            <div className="flipex-stepper-box">
                              <button
                                type="button"
                                className="flipex-stepper-btn"
                                onClick={() => setMinLoadingTime((v) => Math.max(0, v - 1))}
                              >
                                −
                              </button>
                              <span className="flipex-stepper-value">{minLoadingTime}</span>
                              <button
                                type="button"
                                className="flipex-stepper-btn"
                                onClick={() => setMinLoadingTime((v) => Math.min(10, v + 1))}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Display Settings Accordion (Image 2) */}
                    <div className={`flipex-accordion-card ${basicAccordions.display ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="flipex-accordion-header"
                        onClick={() => toggleBasicAccordion('display')}
                      >
                        <span className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-amber-500" /> Display Settings
                        </span>
                        {basicAccordions.display ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {basicAccordions.display && (
                        <div className="flipex-accordion-body">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">QR Code Overlay</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={showQrCode}
                                onChange={(e) => setShowQrCode(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Center the Book</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={centerBook}
                                onChange={(e) => setCenterBook(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Sharpen Book Pages (Crisp Hi-DPI)</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={sharpenPages}
                                onChange={(e) => setSharpenPages(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Remember Last Viewed Page</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={rememberLastPage}
                                onChange={(e) => setRememberLastPage(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>

                          <div className="field">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show Navigation Panel Initially</label>
                            <select
                              className="hz-form-select"
                              value={initialNavPanel}
                              onChange={(e) => setInitialNavPanel(e.target.value as any)}
                            >
                              <option value="none">None</option>
                              <option value="thumbnails">Thumbnails</option>
                              <option value="toc">Table of Contents</option>
                              <option value="bookmarks">Bookmarks</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Watermark Settings */}
                    <div className={`flipex-accordion-card ${basicAccordions.watermark ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="flipex-accordion-header"
                        onClick={() => toggleBasicAccordion('watermark')}
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-amber-500" /> Watermark Settings
                        </span>
                        {basicAccordions.watermark ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {basicAccordions.watermark && (
                        <div className="flipex-accordion-body">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Enable Watermark</span>
                            <label className="hz-switch-row">
                              <input
                                type="checkbox"
                                checked={watermarkEnabled}
                                onChange={(e) => setWatermarkEnabled(e.target.checked)}
                              />
                              <span className="hz-switch-slider" />
                            </label>
                          </div>
                          {watermarkEnabled && (
                            <>
                              <div className="field">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Watermark Text</label>
                                <input
                                  type="text"
                                  className="hz-form-input"
                                  placeholder="e.g. NUVIS FLIPEX CONFIDENTIAL"
                                  value={watermarkText}
                                  onChange={(e) => setWatermarkText(e.target.value)}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="field">
                                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Opacity ({watermarkOpacity}%)</label>
                                  <input
                                    type="range"
                                    min="5"
                                    max="60"
                                    value={watermarkOpacity}
                                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                                  />
                                </div>
                                <div className="field">
                                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Angle ({watermarkAngle}°)</label>
                                  <input
                                    type="range"
                                    min="-90"
                                    max="90"
                                    value={watermarkAngle}
                                    onChange={(e) => setWatermarkAngle(Number(e.target.value))}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Google Analytics & Tag Manager Tools */}
                    <div className={`flipex-accordion-card ${basicAccordions.google ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="flipex-accordion-header"
                        onClick={() => toggleBasicAccordion('google')}
                      >
                        <span className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-amber-500" /> Google Tools (GA4 / GTM)
                        </span>
                        {basicAccordions.google ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {basicAccordions.google && (
                        <div className="flipex-accordion-body">
                          <div className="field">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Google Analytics 4 Measurement ID</label>
                            <input
                              type="text"
                              className="hz-form-input"
                              placeholder="G-XXXXXXXXXX"
                              value={gaTrackingId}
                              onChange={(e) => setGaTrackingId(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Google Tag Manager Container ID</label>
                            <input
                              type="text"
                              className="hz-form-input"
                              placeholder="GTM-XXXXXXX"
                              value={gtmContainerId}
                              onChange={(e) => setGtmContainerId(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ToolBar Settings Tab (Image 8) */
                  <div className="space-y-4">
                    <div className="card space-y-4 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Show Main Toolbar</span>
                        <label className="hz-switch-row">
                          <input
                            type="checkbox"
                            checked={showToolbar}
                            onChange={(e) => setShowToolbar(e.target.checked)}
                          />
                          <span className="hz-switch-slider" />
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Always Show Toolbar on PC</span>
                        <label className="hz-switch-row">
                          <input
                            type="checkbox"
                            checked={alwaysShowToolbarPc}
                            onChange={(e) => setAlwaysShowToolbarPc(e.target.checked)}
                          />
                          <span className="hz-switch-slider" />
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Always Show Toolbar on Mobile</span>
                        <label className="hz-switch-row">
                          <input
                            type="checkbox"
                            checked={alwaysShowToolbarMobile}
                            onChange={(e) => setAlwaysShowToolbarMobile(e.target.checked)}
                          />
                          <span className="hz-switch-slider" />
                        </label>
                      </div>

                      <div className="flipex-color-row">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Toolbar Color</span>
                        <div className="flipex-color-picker-wrap">
                          <span className="flipex-color-hex">{toolbarColor}</span>
                          <input
                            type="color"
                            className="flipex-color-input"
                            value={toolbarColor}
                            onChange={(e) => setToolbarColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flipex-color-row">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Button Icon Color</span>
                        <div className="flipex-color-picker-wrap">
                          <span className="flipex-color-hex">{toolbarButtonColor}</span>
                          <input
                            type="color"
                            className="flipex-color-input"
                            value={toolbarButtonColor}
                            onChange={(e) => setToolbarButtonColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flipex-color-row">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Font / Text Color</span>
                        <div className="flipex-color-picker-wrap">
                          <span className="flipex-color-hex">{toolbarFontColor}</span>
                          <input
                            type="color"
                            className="flipex-color-input"
                            value={toolbarFontColor}
                            onChange={(e) => setToolbarFontColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flipex-color-row">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Page Number Font Color</span>
                        <div className="flipex-color-picker-wrap">
                          <span className="flipex-color-hex">{pageNumberFontColor}</span>
                          <input
                            type="color"
                            className="flipex-color-input"
                            value={pageNumberFontColor}
                            onChange={(e) => setPageNumberFontColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flipex-color-row">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Drawer Panel Background</span>
                        <div className="flipex-color-picker-wrap">
                          <span className="flipex-color-hex">{panelBgColor}</span>
                          <input
                            type="color"
                            className="flipex-color-input"
                            value={panelBgColor}
                            onChange={(e) => setPanelBgColor(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Toolbar Buttons Toggles */}
                    <div className="card space-y-3 p-4">
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">Visible Toolbar Buttons</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showThumbnailsButton}
                            onChange={(e) => setShowThumbnailsButton(e.target.checked)}
                          />
                          <span>Thumbnails Bar 🖼️</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showSearchButton}
                            onChange={(e) => setShowSearchButton(e.target.checked)}
                          />
                          <span>Search 🔍</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showShareButton}
                            onChange={(e) => setShowShareButton(e.target.checked)}
                          />
                          <span>Share</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showFullscreenButton}
                            onChange={(e) => setShowFullscreenButton(e.target.checked)}
                          />
                          <span>Fullscreen ⛶</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowDownload}
                            onChange={(e) => setAllowDownload(e.target.checked)}
                          />
                          <span>Download PDF 📥</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={soundEnabled}
                            onChange={(e) => setSoundEnabled(e.target.checked)}
                          />
                          <span>Flip Sound 🔊</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 4. CUSTOMIZE -> THEMES (IMAGES 3 & 9) ==================== */}
            {activeNav === 'themes' && (
              <div>
                <div className="flipex-segmented-tabs">
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${themesTab === 'presets' ? 'active' : ''}`}
                    onClick={() => setThemesTab('presets')}
                  >
                    Presets (Skin)
                  </button>
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${themesTab === 'layouts' ? 'active' : ''}`}
                    onClick={() => setThemesTab('layouts')}
                  >
                    Layouts
                  </button>
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${themesTab === 'effects' ? 'active' : ''}`}
                    onClick={() => setThemesTab('effects')}
                  >
                    Ambient Effects
                  </button>
                </div>

                {/* Presets Grid (Image 9) */}
                {themesTab === 'presets' && (
                  <div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 mb-4">
                      💡 <b>Notice:</b> Applying a preset skin will automatically harmonize your background, toolbar colors, and button contrast.
                    </div>
                    <div className="flipex-presets-grid">
                      {PRESET_SKINS.map((skin) => (
                        <div
                          key={skin.id}
                          className={`flipex-preset-card ${presetSkinId === skin.id ? 'active' : ''}`}
                          onClick={() => applyPresetSkin(skin)}
                        >
                          <div className="flipex-preset-thumb" style={{ background: skin.bg }}>
                            <div
                              className="w-16 h-10 rounded border shadow-md flex items-center justify-center text-[10px] font-bold"
                              style={{ background: skin.toolbar, color: skin.btn }}
                            >
                              📖 Flip
                            </div>
                          </div>
                          <span className="flipex-preset-card-name">{skin.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layouts Grid (Image 3) */}
                {themesTab === 'layouts' && (
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <input
                        type="text"
                        className="hz-form-input max-w-xs"
                        placeholder="Search layouts..."
                        value={layoutSearch}
                        onChange={(e) => setLayoutSearch(e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                            layoutDevice === 'pc'
                              ? 'bg-amber-400 text-slate-950 border-amber-400'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          onClick={() => setLayoutDevice('pc')}
                        >
                          💻 On PC
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                            layoutDevice === 'mobile'
                              ? 'bg-amber-400 text-slate-950 border-amber-400'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          onClick={() => setLayoutDevice('mobile')}
                        >
                          📱 On Mobile
                        </button>
                      </div>
                    </div>

                    <div className="flipex-presets-grid">
                      {LAYOUT_TEMPLATES.filter((l) =>
                        l.name.toLowerCase().includes(layoutSearch.toLowerCase())
                      ).map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className={`flipex-preset-card ${layoutTemplateId === tmpl.id ? 'active' : ''}`}
                          onClick={() => setLayoutTemplateId(tmpl.id)}
                        >
                          <div className="flipex-preset-thumb bg-slate-200 dark:bg-slate-800 flex flex-col items-center justify-center p-2 text-center">
                            <span className="text-xl mb-1">📑</span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 line-clamp-2">{tmpl.desc}</span>
                          </div>
                          <span className="flipex-preset-card-name">{tmpl.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ambient Effects */}
                {themesTab === 'effects' && (
                  <div className="grid grid-cols-2 gap-3">
                    {AMBIENT_EFFECTS.map((eff) => (
                      <button
                        key={eff.id}
                        type="button"
                        className={`p-3.5 rounded-xl border text-left font-medium text-xs transition-all ${
                          backgroundEffect === eff.id
                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                        onClick={() => setBackgroundEffect(eff.id)}
                      >
                        {eff.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==================== 5. CUSTOMIZE -> NAVIGATE ==================== */}
            {activeNav === 'navigate' && (
              <div className="space-y-4">
                <div className="field">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Page Flip Transition</label>
                  <select
                    className="hz-form-select"
                    value={pageEffect}
                    onChange={(e) => setPageEffect(e.target.value as PageEffectType)}
                  >
                    <option value="magazine">3D Realistic Magazine Flip (Default)</option>
                    <option value="book">Hardcover Book</option>
                    <option value="album">Photo Album</option>
                    <option value="notebook">Spiral Notebook</option>
                    <option value="slider">Horizontal Slide (Touch swipe)</option>
                    <option value="cards">Card Stack Deck</option>
                    <option value="coverflow">Coverflow 3D Carousel</option>
                    <option value="one_page">Single Page Flip</option>
                  </select>
                </div>

                <div className="field">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Default Reading Mode</label>
                  <select
                    className="hz-form-select"
                    value={defaultReadingMode}
                    onChange={(e) => setDefaultReadingMode(e.target.value as any)}
                  >
                    <option value="flip">Flipbook 3D (Pages turn side-by-side)</option>
                    <option value="scroll">Vertical Continuous Scroll (PDF / Web style)</option>
                    <option value="reader">Focused Reader (Clean distraction-free)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Right-to-Left Reading (RTL / Arabic / Hebrew)</span>
                  <label className="hz-switch-row">
                    <input
                      type="checkbox"
                      checked={rightToLeft}
                      onChange={(e) => setRightToLeft(e.target.checked)}
                    />
                    <span className="hz-switch-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* ==================== 6. SHARE -> SOCIAL (IMAGE 6) ==================== */}
            {activeNav === 'share_social' && (
              <div className="space-y-6">
                <div className="card space-y-4 p-5">
                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Public Book Link</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        className="hz-form-input font-mono text-xs"
                        value={publicUrl}
                      />
                      <button
                        type="button"
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow-sm whitespace-nowrap"
                        onClick={copyBookLink}
                      >
                        {copiedLink ? 'Copied! ✓' : 'Copy Link'}
                      </button>
                    </div>
                  </div>

                  {/* QR Code generator */}
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`}
                      alt="QR Code"
                      className="w-36 h-36 border p-2 bg-white rounded-lg shadow-sm"
                    />
                    <span className="text-[11px] text-slate-500 mt-2">Scan with mobile to read on smartphones & tablets</span>
                  </div>

                  {/* 1-Click Social Sharing */}
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block mb-2">
                      Quick Share to Social Networks
                    </label>
                    <div className="flipex-share-social-row">
                      <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flipex-social-btn"
                        title="Share on Facebook"
                      >
                        FB
                      </a>
                      <a
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(companyName || flipbook.title)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flipex-social-btn"
                        title="Share on X"
                      >
                        𝕏
                      </a>
                      <a
                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flipex-social-btn"
                        title="Share on LinkedIn"
                      >
                        in
                      </a>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${companyName || flipbook.title} - ${publicUrl}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flipex-social-btn"
                        title="Share on WhatsApp"
                      >
                        WA
                      </a>
                      <a
                        href={`mailto:?subject=${encodeURIComponent(companyName || flipbook.title)}&body=${encodeURIComponent(`Check out this publication: ${publicUrl}`)}`}
                        className="flipex-social-btn"
                        title="Share via Email"
                      >
                        ✉️
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 7. SHARE -> EMBED (IMAGE 10) ==================== */}
            {activeNav === 'embed' && (
              <div className="space-y-5">
                <div className="flipex-segmented-tabs">
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${embedTab === 'iframe' ? 'active' : ''}`}
                    onClick={() => setEmbedTab('iframe')}
                  >
                    Iframe
                  </button>
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${embedTab === 'wordpress' ? 'active' : ''}`}
                    onClick={() => setEmbedTab('wordpress')}
                  >
                    WordPress
                  </button>
                  <button
                    type="button"
                    className={`flipex-segmented-tab ${embedTab === 'popup' ? 'active' : ''}`}
                    onClick={() => setEmbedTab('popup')}
                  >
                    Pop-up Window
                  </button>
                </div>

                <div className="card space-y-4 p-5">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">Choose Embed Size</label>
                    <div className="flipex-embed-size-group">
                      <label className="flipex-embed-chip">
                        <input
                          type="radio"
                          name="embedSize"
                          checked={embedSize === 'responsive'}
                          onChange={() => setEmbedSize('responsive')}
                        />
                        <span>Responsive (100% width)</span>
                      </label>
                      <label className="flipex-embed-chip">
                        <input
                          type="radio"
                          name="embedSize"
                          checked={embedSize === '400x250'}
                          onChange={() => setEmbedSize('400x250')}
                        />
                        <span>400px × 250px</span>
                      </label>
                      <label className="flipex-embed-chip">
                        <input
                          type="radio"
                          name="embedSize"
                          checked={embedSize === '700x400'}
                          onChange={() => setEmbedSize('700x400')}
                        />
                        <span>700px × 400px</span>
                      </label>
                      <label className="flipex-embed-chip">
                        <input
                          type="radio"
                          name="embedSize"
                          checked={embedSize === '900x500'}
                          onChange={() => setEmbedSize('900x500')}
                        />
                        <span>900px × 500px</span>
                      </label>
                      <label className="flipex-embed-chip">
                        <input
                          type="radio"
                          name="embedSize"
                          checked={embedSize === 'custom'}
                          onChange={() => setEmbedSize('custom')}
                        />
                        <span>Custom</span>
                      </label>
                    </div>

                    {embedSize === 'custom' && (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 text-xs">
                          <span>W:</span>
                          <input
                            type="number"
                            className="hz-form-input w-20 text-xs"
                            value={embedCustomW}
                            onChange={(e) => setEmbedCustomW(e.target.value)}
                          />
                          <span>px</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span>H:</span>
                          <input
                            type="number"
                            className="hz-form-input w-20 text-xs"
                            value={embedCustomH}
                            onChange={(e) => setEmbedCustomH(e.target.value)}
                          />
                          <span>px</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Start Page</label>
                    <input
                      type="number"
                      className="hz-form-input w-28 text-xs"
                      min="1"
                      value={embedStartPage}
                      onChange={(e) => setEmbedStartPage(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Embed Code Snippet</label>
                      <button
                        type="button"
                        className="px-3 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded shadow-sm inline-flex items-center gap-1"
                        onClick={copyEmbedCode}
                      >
                        {copiedEmbed ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedEmbed ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={5}
                      className="hz-form-textarea font-mono text-xs bg-slate-50 dark:bg-slate-900"
                      value={getEmbedCode()}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 8. BOOK INFO ==================== */}
            {activeNav === 'book_info' && (
              <div className="card space-y-4 p-5">
                <div className="field">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Publication Title</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Catalogue / Subtitle</label>
                  <input
                    type="text"
                    className="hz-form-input"
                    placeholder="e.g. 2026 EDITION"
                    value={catalogueSubtitle}
                    onChange={(e) => setCatalogueSubtitle(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Private Notes (Admin Only)</label>
                  <textarea
                    rows={3}
                    className="hz-form-textarea"
                    placeholder="Internal reference notes..."
                    value={privateNotes}
                    onChange={(e) => setPrivateNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ==================== 9. MONETIZE & LEADS ==================== */}
            {activeNav === 'monetize' && (
              <div className="space-y-4">
                <div className="card space-y-4 p-5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Lead Capture Form Gate</h4>
                  <p className="text-xs text-slate-500">Require readers to enter their email address before accessing specific pages.</p>
                  <div className="field">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Gate at Page Number</label>
                    <input type="number" min="1" max="100" defaultValue="3" className="hz-form-input w-28 text-xs" />
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 10. STATISTICS ==================== */}
            {activeNav === 'statistics' && (
              <div className="card space-y-4 p-6 text-center">
                <Activity className="h-10 w-10 text-amber-500 mx-auto" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Publication Analytics & Live Heatmaps</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Track real-time reader page views, dwell time per spread, device breakdowns, and hotspot click conversion.
                </p>
                <Link
                  to={`/dashboard/analytics/${flipbook.id}`}
                  className="btn-pub-primary inline-flex items-center gap-1.5 mx-auto"
                  onClick={onClose}
                >
                  <span>Open Analytics Dashboard</span> <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* ==================== 11. ACCESSIBILITY ==================== */}
            {activeNav === 'accessibility' && (
              <div className="card space-y-4 p-5">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Accessibility & WCAG Support</h4>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" defaultChecked />
                  <span>Enable full screen-reader ARIA live region narration</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" defaultChecked />
                  <span>Keyboard navigation (Arrow keys, Spacebar, Home, End)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" defaultChecked />
                  <span>High-contrast focus ring outlines for keyboard tab navigation</span>
                </label>
              </div>
            )}
          </div>

          {/* Modal Footer (Save & Close) */}
          <div className="hz-studio-footer">
            <label
              className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer mr-auto select-none"
              title="Automatically apply your logo, theme skin, toolbar colors, and profile to all future PDF uploads in your workspace"
            >
              <input
                type="checkbox"
                checked={saveAsBrandKit}
                onChange={(e) => setSaveAsBrandKit(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              <span>Save as Workspace Default Brand Kit</span>
            </label>
            {msg && (
              <span
                className={`text-xs font-semibold mr-3 ${
                  msg.includes('saved') || msg.includes('success') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                {msg}
              </span>
            )}
            <button type="button" className="hz-btn-close" onClick={onClose} disabled={saving}>
              Close
            </button>
            <button
              type="button"
              className="btn-pub-primary font-bold shadow-md"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Apply & Save ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
