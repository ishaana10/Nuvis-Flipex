/**
 * Tiny wireframe of each reader layout (bundled SVG, no images): shows where the toolbar sits,
 * whether side arrows / scrubber / zoom exist, and how heavy the chrome looks.
 */
interface Cfg {
  top: 'full' | 'min' | 'none' | 'hover';
  bar: 'pill' | 'top' | 'edge' | 'counter' | 'none' | 'hover';
  arrows: 'none' | 'normal' | 'big' | 'round';
  scrub: boolean;
  zoom: boolean;
  look: 'solid' | 'glass' | 'clear' | 'accent' | 'round';
}

const CFG: Record<string, Cfg> = {
  refined: { top: 'full', bar: 'pill', arrows: 'none', scrub: false, zoom: false, look: 'glass' },
  handy: { top: 'full', bar: 'top', arrows: 'normal', scrub: true, zoom: false, look: 'solid' },
  active: { top: 'full', bar: 'pill', arrows: 'normal', scrub: true, zoom: true, look: 'accent' },
  classical: { top: 'full', bar: 'counter', arrows: 'normal', scrub: false, zoom: false, look: 'clear' },
  clear: { top: 'min', bar: 'counter', arrows: 'normal', scrub: false, zoom: false, look: 'clear' },
  popular: { top: 'full', bar: 'pill', arrows: 'normal', scrub: true, zoom: true, look: 'solid' },
  facile: { top: 'min', bar: 'counter', arrows: 'big', scrub: false, zoom: false, look: 'solid' },
  float: { top: 'full', bar: 'counter', arrows: 'round', scrub: false, zoom: false, look: 'glass' },
  fresh: { top: 'full', bar: 'pill', arrows: 'normal', scrub: true, zoom: false, look: 'round' },
  gorgeous: { top: 'full', bar: 'pill', arrows: 'normal', scrub: true, zoom: false, look: 'accent' },
  lively: { top: 'full', bar: 'pill', arrows: 'normal', scrub: true, zoom: true, look: 'accent' },
  neat: { top: 'full', bar: 'edge', arrows: 'normal', scrub: true, zoom: false, look: 'solid' },
  pure: { top: 'hover', bar: 'hover', arrows: 'normal', scrub: false, zoom: false, look: 'clear' },
  simple: { top: 'min', bar: 'counter', arrows: 'normal', scrub: false, zoom: false, look: 'solid' },
  specific: { top: 'full', bar: 'pill', arrows: 'none', scrub: true, zoom: false, look: 'solid' },
  minimalist: { top: 'min', bar: 'pill', arrows: 'normal', scrub: false, zoom: false, look: 'clear' },
};

export default function LayoutThumb({ id }: { id: string }) {
  const c = CFG[id] || CFG.popular;
  const chrome = c.look === 'clear' ? 'none' : c.look === 'glass' ? 'rgba(255,255,255,.22)' : '#1e293b';
  const stroke = c.look === 'accent' ? '#f59e0b' : 'rgba(148,163,184,.6)';
  const dim = c.top === 'hover' || c.bar === 'hover' ? 0.45 : 1;
  const ar = c.arrows === 'big' ? 11 : c.arrows === 'round' ? 6 : 7;

  let barY = 76;
  let barX = 40, barW = 80, barH = 9, barR = c.look === 'round' ? 5 : c.look === 'glass' || c.look === 'accent' ? 5 : 3;
  if (c.bar === 'top') barY = 20;
  if (c.bar === 'edge') { barX = 0; barW = 160; barY = 81; barH = 9; barR = 0; }
  if (c.bar === 'counter') { barX = 62; barW = 36; }

  return (
    <svg viewBox="0 0 160 90" className="flipex-layout-thumb" role="img" aria-label={`${id} layout wireframe`}>
      <rect width="160" height="90" rx="4" fill="#0f172a" />
      {/* open book */}
      <rect x="45" y="22" width="34" height="50" rx="1.5" fill="#f1f5f9" />
      <rect x="81" y="22" width="34" height="50" rx="1.5" fill="#e2e8f0" />
      <rect x="50" y="28" width="22" height="3" rx="1" fill="#94a3b8" />
      <rect x="50" y="35" width="24" height="2" rx="1" fill="#cbd5e1" />
      <rect x="86" y="28" width="22" height="3" rx="1" fill="#94a3b8" />
      <rect x="86" y="35" width="24" height="2" rx="1" fill="#cbd5e1" />
      {/* top bar */}
      {c.top !== 'none' && (
        <g opacity={dim}>
          <rect x="6" y="5" width="30" height="7" rx="3.5" fill={c.look === 'clear' ? 'none' : '#1e293b'} stroke={c.look === 'clear' ? 'rgba(148,163,184,.5)' : 'none'} />
          {(c.top === 'full' || c.top === 'hover') && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={104 + i * 10} cy="8.5" r="3.2" fill={c.look === 'round' ? '#f59e0b' : '#334155'} />)}
          {c.top === 'min' && [0, 1].map((i) => <circle key={i} cx={134 + i * 10} cy="8.5" r="3.2" fill="#334155" />)}
        </g>
      )}
      {/* side arrows */}
      {c.arrows !== 'none' && (
        <g fill="#475569">
          {c.arrows === 'round' ? (
            <>
              <circle cx="14" cy="46" r={ar} />
              <circle cx="146" cy="46" r={ar} />
            </>
          ) : (
            <>
              <rect x="5" y={46 - ar - 2} width={ar + 1} height={(ar + 2) * 2} rx="2" />
              <rect x={154 - ar} y={46 - ar - 2} width={ar + 1} height={(ar + 2) * 2} rx="2" />
            </>
          )}
        </g>
      )}
      {/* bottom / top toolbar */}
      {c.bar !== 'none' && (
        <g opacity={dim}>
          <rect x={barX} y={barY} width={barW} height={barH} rx={barR} fill={chrome} stroke={stroke} strokeWidth="1" />
          <text x={barX + barW / 2} y={barY + 6.5} fontSize="5" textAnchor="middle" fill="#cbd5e1">
            {c.bar === 'counter' ? '2 / 8' : '‹  2/8  ›'}
          </text>
          {c.scrub && c.bar !== 'counter' && <rect x={barX + 6} y={barY + 4} width="0" height="1" />}
          {c.scrub && c.bar !== 'counter' && <line x1={barX + barW - 34} y1={barY + 4.5} x2={barX + barW - 8} y2={barY + 4.5} stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round" />}
          {c.zoom && c.bar === 'pill' && <text x={barX + barW - 6} y={barY + 6.5} fontSize="4.5" fill="#94a3b8">+−</text>}
        </g>
      )}
    </svg>
  );
}
