import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

/** Scoped animations revert on unmount, media changes and StrictMode remounts. */
export function useHomeMotion() {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const media = gsap.matchMedia()
    media.add({
      desktop: '(min-width: 801px)',
      mobile: '(max-width: 800px)',
      reduced: '(prefers-reduced-motion: reduce)',
    }, (context) => {
      if (context.conditions?.reduced) return
      const distance = context.conditions?.desktop ? 24 : 12
      const intro = gsap.timeline({ defaults: { duration: .65, ease: 'power3.out' } })
      intro.from('.hero-copy > *', { y: distance, opacity: 0, stagger: .075, clearProps: 'transform,opacity,visibility' })
        .from('.thought-bubble, .voice-bubble, .idea-bubble', { y: distance, autoAlpha: 0, stagger: .12, clearProps: 'transform,opacity,visibility' }, .12)
        .from('.art-spark', { scale: .5, autoAlpha: 0, stagger: .1, clearProps: 'transform,opacity,visibility' }, .35)

      // A short waveform flourish settles in under five seconds; no perpetual motion.
      intro.to('.voice-bars i', {
        scaleY: .45, transformOrigin: 'center', duration: .45,
        stagger: { each: .045, repeat: 3, yoyo: true },
        ease: 'sine.inOut', clearProps: 'transform',
      }, .45)

      // Create paused tweens inside the context so observer callbacks only play them.
      const reveals = Array.from(element.querySelectorAll<HTMLElement>('.training-heading, .training-card, .practice-progress, .recent-practice, .memory-panel, .home-footer'))
        .map(target => ({ target, tween: gsap.from(target, {
          // Keep offscreen controls in the tab order; focus finishes their reveal.
          y: distance, opacity: 0, duration: .6, ease: 'power3.out', paused: true,
          clearProps: 'transform,opacity,visibility',
        }) }))
      const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting)
        visible.forEach((entry, index) => {
          const reveal = reveals.find(item => item.target === entry.target)
          reveal?.tween.delay(index * .07).play()
          observer.unobserve(entry.target)
        })
      }, { threshold: .12 })
      reveals.forEach(({ target }) => observer.observe(target))
      // Keyboard focus must never wait for a scroll animation to reveal a control.
      const revealFocused = (event: FocusEvent) => {
        if (event.target instanceof Element && event.target.closest('.hero-copy')) intro.progress(1)
        reveals.forEach(({ target, tween }) => {
          if (event.target instanceof Node && target.contains(event.target)) {
            tween.progress(1).pause()
            observer.unobserve(target)
          }
        })
      }
      element.addEventListener('focusin', revealFocused)
      return () => {
        observer.disconnect()
        element.removeEventListener('focusin', revealFocused)
      }
    }, element)

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const cleanups = Array.from(element.querySelectorAll<HTMLElement>('.training-card, .hero-cta')).map(button => {
        const arrow = button.querySelector('.training-action svg, .hero-cta > svg')
        const icon = button.querySelector('.training-icon')
        const hover = gsap.timeline({ paused: true, defaults: { duration: .28, ease: 'power2.out' } })
        if (arrow) hover.to(arrow, { x: 4 }, 0)
        if (icon) hover.to(icon, { y: -3, rotation: -5, scale: 1.05 }, 0)
        // Animate the contents, not the card's reveal transform or its hit area.
        const pressTarget = button.querySelector('.training-card-top') ?? button.querySelector('svg')
        const press = gsap.timeline({ paused: true })
        if (pressTarget) press.to(pressTarget, { scale: .96, duration: .12, ease: 'power2.out' })
        const down = (event: PointerEvent) => { if (event.isPrimary && event.button === 0) press.play() }
        const release = () => { press.reverse() }
        const enter = () => { hover.play() }
        const pointerEnter = (event: PointerEvent) => { if (event.pointerType === 'mouse') enter() }
        const leave = () => { release(); if (!button.matches(':hover, :focus-visible')) hover.reverse() }
        button.addEventListener('pointerdown', down)
        button.addEventListener('pointerup', release)
        button.addEventListener('pointercancel', release)
        button.addEventListener('pointerenter', pointerEnter)
        button.addEventListener('pointerleave', leave)
        button.addEventListener('focus', enter)
        button.addEventListener('blur', leave)
        return () => {
          button.removeEventListener('pointerdown', down)
          button.removeEventListener('pointerup', release)
          button.removeEventListener('pointercancel', release)
          button.removeEventListener('pointerenter', pointerEnter)
          button.removeEventListener('pointerleave', leave)
          button.removeEventListener('focus', enter)
          button.removeEventListener('blur', leave)
        }
      })
      return () => cleanups.forEach(cleanup => cleanup())
    }, element)
    return () => media.revert()
  }, [])

  return root
}
