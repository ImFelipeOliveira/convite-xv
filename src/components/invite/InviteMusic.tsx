'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './music.css'

// Background music of the invite (the file the admin uploaded in Configurações; never in git).
//
// - Browsers block autoplay with sound and iOS only plays when play() runs synchronously inside a tap,
//   so the music starts from the envelope-open click (Opening calls startFromGesture in its handler).
// - Returning visitors skip the envelope (localStorage 'xv:opened'). For them the music does NOT start on
//   their first tap elsewhere: that tap is usually "Confirmar presença" or a gift, and sound starting
//   mid-task would be a surprise. They get the toggle only (not pressed) and can play it from there.
// - A pause is remembered (localStorage), so a guest who paused once isn't greeted by music again.
// - preload="none" keeps the first load light: nothing is downloaded until the guest opens the envelope.

const PAUSED_KEY = 'xv:music-paused'
const TARGET_VOLUME = 0.45
const FADE_MS = 1500

type InviteMusicApi = {
  /** Call synchronously inside the envelope-open click (iOS needs the gesture). */
  startFromGesture: () => void
  /** The invite content is visible (envelope opened, or a returning visitor): show the toggle. */
  revealed: () => void
}

const InviteMusicContext = createContext<InviteMusicApi | null>(null)

/** The music controls when the invite has music, else null (Opening works the same without it). */
export function useInviteMusic(): InviteMusicApi | null {
  return useContext(InviteMusicContext)
}

function readPaused(): boolean {
  try {
    return window.localStorage.getItem(PAUSED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberPaused(paused: boolean): void {
  try {
    if (paused) window.localStorage.setItem(PAUSED_KEY, '1')
    else window.localStorage.removeItem(PAUSED_KEY)
  } catch {
    // storage unavailable (private mode, blocked): the choice just isn't remembered
  }
}

export function InviteMusic({ src, startAt, children }: { src: string; startAt: number; children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const fadeFrame = useRef<number | null>(null)
  const resumeWhenVisible = useRef(false)
  const startApplied = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(false)

  const stopFade = () => {
    if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current)
    fadeFrame.current = null
  }

  /** Ramps the volume up; where volume is read-only (iOS) it stays at 1 and the music simply starts. */
  const fadeIn = useCallback((audio: HTMLAudioElement) => {
    stopFade()
    audio.volume = 0
    if (audio.volume !== 0) return // iOS ignores volume: no fade, no harm
    const startedAt = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / FADE_MS)
      audio.volume = TARGET_VOLUME * t * (2 - t) // ease-out
      fadeFrame.current = t < 1 ? requestAnimationFrame(step) : null
    }
    fadeFrame.current = requestAnimationFrame(step)
  }, [])

  /** Seeks to the admin's start point once (the #t= fragment covers browsers that load before this runs). */
  const applyStart = useCallback(
    (audio: HTMLAudioElement) => {
      if (startApplied.current || startAt <= 0) return
      const seek = () => {
        if (startApplied.current) return
        startApplied.current = true
        try {
          if (audio.currentTime < startAt) audio.currentTime = startAt
        } catch {
          // not seekable yet: the fragment start applies
        }
      }
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) seek()
      else audio.addEventListener('loadedmetadata', seek, { once: true })
    },
    [startAt],
  )

  /** play() is called synchronously here, so it stays inside the caller's user gesture. */
  const play = useCallback(
    (fade: boolean) => {
      const audio = audioRef.current
      if (!audio) return
      applyStart(audio)
      if (fade) fadeIn(audio)
      else {
        stopFade()
        audio.volume = TARGET_VOLUME
      }
      const attempt = audio.play()
      attempt?.catch(() => {
        // blocked or failed to load: the toggle shows "Tocar música" and the guest can retry
        stopFade()
        setPlaying(false)
      })
    },
    [applyStart, fadeIn],
  )

  const api = useMemo<InviteMusicApi>(
    () => ({
      startFromGesture: () => {
        if (!readPaused()) play(true)
      },
      revealed: () => setShown(true),
    }),
    [play],
  )

  // a hidden tab goes quiet; it resumes on return only if it was playing
  useEffect(() => {
    const onVisibility = () => {
      const audio = audioRef.current
      if (!audio) return
      if (document.visibilityState === 'hidden') {
        resumeWhenVisible.current = !audio.paused
        if (!audio.paused) audio.pause()
      } else if (resumeWhenVisible.current) {
        resumeWhenVisible.current = false
        play(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [play])

  useEffect(() => () => stopFade(), [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      stopFade()
      audio.pause()
      rememberPaused(true)
    } else {
      rememberPaused(false)
      play(true)
    }
  }

  return (
    <InviteMusicContext.Provider value={api}>
      {children}
      <audio
        ref={audioRef}
        src={startAt > 0 ? `${src}#t=${startAt}` : src}
        preload="none"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        data-testid="invite-music"
      />
      {shown && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          aria-label={playing ? 'Pausar música' : 'Tocar música'}
          className={`invite-music-toggle${playing ? ' is-playing' : ''}`}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
            {!playing && <path className="invite-music-slash" d="M3 3l18 18" />}
          </svg>
        </button>
      )}
    </InviteMusicContext.Provider>
  )
}
