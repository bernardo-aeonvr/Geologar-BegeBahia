/** Ícones SVG inline (autocontido — sem fontes/ícones externos). */
type P = { size?: number };
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconPlay = ({ size = 22 }: P) => svg(size, <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />);
export const IconPause = ({ size = 22 }: P) =>
  svg(size, <>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </>);
export const IconPrev = ({ size = 22 }: P) => svg(size, <><path d="M18 5 9 12l9 7z" fill="currentColor" stroke="none" /><path d="M6 5v14" /></>);
export const IconNext = ({ size = 22 }: P) => svg(size, <><path d="m6 5 9 7-9 7z" fill="currentColor" stroke="none" /><path d="M18 5v14" /></>);
export const IconVolume = ({ size = 22 }: P) =>
  svg(size, <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /></>);
export const IconMuted = ({ size = 22 }: P) =>
  svg(size, <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" /><path d="m16 9.5 5 5m0-5-5 5" /></>);
export const IconList = ({ size = 22 }: P) => svg(size, <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const IconClose = ({ size = 22 }: P) => svg(size, <path d="M6 6l12 12M18 6 6 18" />);
export const IconRestart = ({ size = 22 }: P) => svg(size, <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>);
export const IconVR = ({ size = 22 }: P) =>
  svg(size, <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-4l-2-2.5h-3L8.5 17h-4A1.5 1.5 0 0 1 3 15.5z" />);
export const IconDrag = ({ size = 22 }: P) =>
  svg(size, <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>);
