import type { CSSProperties } from 'react'

export type IconName = 'wave' | 'mic' | 'layers' | 'document' | 'arrow' | 'leaf' | 'clock' | 'key'
const paths: Record<IconName, React.ReactNode> = {
  wave: <><path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" /></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  document: <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h5" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  leaf: <><path d="M20 4C8 2 2 9 6 16s16 2 14-12ZM4 21 15 10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-3 3 3 3m-6 0 2 2" /></>,
}
export default function Icon({ name, size = 24, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>
}
