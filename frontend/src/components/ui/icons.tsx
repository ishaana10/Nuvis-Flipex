import type { SVGProps } from 'react';

export function IconBase({ children, className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckCircle2 = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></IconBase>
);
export const Clock = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></IconBase>
);
export const FileText = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></IconBase>
);
export const GitBranch = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></IconBase>
);
export const Globe = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></IconBase>
);
export const History = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></IconBase>
);
export const RotateCcw = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></IconBase>
);
export const Send = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></IconBase>
);
export const ShieldCheck = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></IconBase>
);
export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></IconBase>
);
export const Tag = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></IconBase>
);
export const Upload = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></IconBase>
);
export const X = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></IconBase>
);
export const ExternalLink = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></IconBase>
);
export const Archive = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></IconBase>
);
export const AlertCircle = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></IconBase>
);
export const Download = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></IconBase>
);
export const FolderKanban = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /></IconBase>
);
export const Activity = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></IconBase>
);
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <IconBase {...p}><path d="M5 12h14" /><path d="M12 5v14" /></IconBase>
);
