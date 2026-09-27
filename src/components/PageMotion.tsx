import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { gsap } from 'gsap'

/** Animate a route as one surface so reading order and controls remain intact. */
export default function PageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useLayoutEffect(() => {
    // New destinations start at their heading; browser back retains its own restoration.
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, navigationType])

  useLayoutEffect(() => {
    // The homepage owns its coordinated sequence; timed practice stays steady.
    if (pathname === '/' || pathname.startsWith('/practice') || pathname.startsWith('/simulate/play')) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const entrance = gsap.from(root.current, {
        y: 10,
        opacity: 0,
        duration: .38,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      })
      const finish = () => entrance.progress(1)
      const element = root.current
      element?.addEventListener('focusin', finish)
      return () => element?.removeEventListener('focusin', finish)
    }, root)
    return () => media.revert()
  }, [pathname])

  return <div ref={root}>{children}</div>
}
