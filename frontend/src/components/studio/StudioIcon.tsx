import type { CSSProperties } from 'react';

/**
 * Bundled stroke icon set for Flipex Studio (24x24, currentColor).
 * Drawn in-house, inlined as SVG: no icon font, no CDN, no npm package.
 */
const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  files: 'M8 7V5a1 1 0 0 1 1-1h7l4 4v9a1 1 0 0 1-1 1h-2M4 8a1 1 0 0 1 1-1h7l3 3v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
  layout: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M9 21V9',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  cart: 'M3 4h2l2.4 10.5a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6M9.5 19.2a1 1 0 1 0 0 .01M17 19.2a1 1 0 1 0 0 .01',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  utensils: 'M6 3v8M4 3v5a2 2 0 0 0 4 0V3M6 11v10M17 21V3c-2.2 1-3.5 3.5-3.5 7 0 2 1.2 3 3.5 3',
  building: 'M6 3h12a1 1 0 0 1 1 1v17H5V4a1 1 0 0 1 1-1zM9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4',
  grad: 'm2 9 10-5 10 5-10 5zM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.5 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
  rocket: 'M12 15l-3-3a15 15 0 0 1 4-7.5C16 2.5 19 3 21 3c0 2 .5 5-2 8a15 15 0 0 1-7.5 4zM9 12H5l2-3.5h3M12 15v4l3.5-2V13.5M5.5 15.5C4 16.7 3.5 19.5 3.5 20.5c1 0 3.8-.5 5-2',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 16l-5-5-9 9',
  award: 'M12 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8.5 14 7 21l5-3 5 3-1.5-7',
  table: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18M3 15h18M9 4v16',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevL: 'm15 6-6 6 6 6',
  chevR: 'm9 6 6 6-6 6',
  chevD: 'm6 9 6 6 6-6',
  panel: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16',
  panelOpen: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M14 9.5l2.5 2.5-2.5 2.5',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4-4',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  shield: 'M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6zM9 12l2.2 2.2L15 10',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  palm: 'M12 21V11M12 11C9.5 8 6 8 3.5 9.5 6 9.5 8.5 10 12 11zM12 11c2.5-3 6-3 8.5-1.5-2.5 0-5 .5-8.5 1.5zM12 11C11 7.5 8.5 5.5 5.5 5.5c2 1 3.8 3 6.5 5.5zM12 11c1-3.5 3.5-5.5 6.5-5.5-2 1-3.8 3-6.5 5.5z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
};

export type StudioIconName = keyof typeof P;

export function StudioIcon({
  name,
  size = 16,
  stroke = 1.8,
  style,
  className,
}: {
  name: StudioIconName | string;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const d = P[name] || P.file;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
    >
      <path d={d} />
    </svg>
  );
}

export default StudioIcon;
