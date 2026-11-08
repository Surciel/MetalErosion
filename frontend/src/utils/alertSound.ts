import type { SeverityLevel } from "@/types"

/**
 * Severity alert tones generated with the Web Audio API (no audio files to host).
 *
 * Browsers block audio that is not started from a user gesture. primeAlertAudio()
 * is called from the "Start scan" click so the AudioContext is already unlocked when
 * the analysis result arrives several seconds later.
 */

const MUTE_STORAGE_KEY = "rustscan.alertMuted"

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  try {
    audioContext = new AudioContextClass()
  } catch {
    audioContext = null
  }
  return audioContext
}

/** Call inside a click/keypress handler to unlock audio for later playback. */
export function primeAlertAudio(): void {
  const context = getAudioContext()
  if (context && context.state === "suspended") {
    void context.resume().catch(() => undefined)
  }
}

export function isAlertMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function setAlertMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted))
  } catch {
    // Storage can be unavailable (private mode); muting then lasts for this page only.
  }
}

type Note = {
  frequency: number
  start: number // seconds from now
  duration: number // seconds
  type: OscillatorType
  volume: number
}

function playNotes(notes: Note[]): void {
  const context = getAudioContext()
  if (!context) return
  if (context.state === "suspended") void context.resume().catch(() => undefined)

  const now = context.currentTime + 0.05
  for (const note of notes) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = note.type
    oscillator.frequency.setValueAtTime(note.frequency, now + note.start)
    // Short attack/release envelope avoids clicks.
    gain.gain.setValueAtTime(0.0001, now + note.start)
    gain.gain.exponentialRampToValueAtTime(note.volume, now + note.start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now + note.start)
    oscillator.stop(now + note.start + note.duration + 0.05)
  }
}

const TONES: Record<SeverityLevel, Note[]> = {
  // Urgent: three rapid high/low pulses, repeated twice.
  critical: [0, 0.9].flatMap((offset) =>
    [0, 0.3, 0.6].flatMap((pulse) => [
      { frequency: 988, start: offset + pulse, duration: 0.14, type: "square" as const, volume: 0.12 },
      { frequency: 740, start: offset + pulse + 0.14, duration: 0.14, type: "square" as const, volume: 0.12 },
    ]),
  ),
  // Two-tone rising chime.
  high: [
    { frequency: 660, start: 0, duration: 0.25, type: "triangle", volume: 0.2 },
    { frequency: 880, start: 0.22, duration: 0.35, type: "triangle", volume: 0.2 },
  ],
  // Soft single chime.
  moderate: [{ frequency: 587, start: 0, duration: 0.45, type: "sine", volume: 0.18 }],
  low: [{ frequency: 523, start: 0, duration: 0.4, type: "sine", volume: 0.14 }],
  // No corrosion: no sound.
  none: [],
}

export function playSeverityTone(level: SeverityLevel): void {
  if (isAlertMuted()) return
  try {
    playNotes(TONES[level])
  } catch {
    // Audio is a convenience; never let it break the results page.
  }
}
