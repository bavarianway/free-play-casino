/**
 * Responsible-play session tracking: periodic reminders and an optional
 * self-imposed session time limit. Pure functions; the UI supplies the clock.
 */
import { readJson, writeJson, type StorageLike } from '../storage';

export const DEFAULT_REMINDER_MINUTES = 30;
export const MIN_LIMIT_MINUTES = 5;
export const MAX_LIMIT_MINUTES = 720;

export interface SessionSettings {
  /** Minutes after which play is paused for this session; null = no limit. */
  limitMinutes: number | null;
  reminderMinutes: number;
}
export interface SessionClock {
  startedAt: number;
  lastReminderAt: number;
}
export interface SessionStatus {
  elapsedMs: number;
  limitReached: boolean;
  reminderDue: boolean;
  remainingMs: number | null;
}

export const DEFAULT_SETTINGS: SessionSettings = { limitMinutes: null, reminderMinutes: DEFAULT_REMINDER_MINUTES };

export function startSession(now: number): SessionClock {
  return { startedAt: now, lastReminderAt: now };
}

export function evaluateSession(clock: SessionClock, settings: SessionSettings, now: number): SessionStatus {
  const elapsedMs = Math.max(0, now - clock.startedAt);
  const limitMs = settings.limitMinutes === null ? null : settings.limitMinutes * 60_000;
  const limitReached = limitMs !== null && elapsedMs >= limitMs;
  const reminderDue = !limitReached && now - clock.lastReminderAt >= settings.reminderMinutes * 60_000;
  return { elapsedMs, limitReached, reminderDue, remainingMs: limitMs === null ? null : Math.max(0, limitMs - elapsedMs) };
}

export function acknowledgeReminder(clock: SessionClock, now: number): SessionClock {
  return { ...clock, lastReminderAt: now };
}

export function validateLimitMinutes(m: number | null): m is number | null {
  return m === null || (Number.isInteger(m) && m >= MIN_LIMIT_MINUTES && m <= MAX_LIMIT_MINUTES);
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export const SETTINGS_KEY = 'freecasino.session-settings.v1';

export function loadSettings(storage: StorageLike): SessionSettings {
  const raw = readJson(storage, SETTINGS_KEY) as Partial<SessionSettings> | null;
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const limit = raw.limitMinutes === undefined ? null : raw.limitMinutes;
  const rem = raw.reminderMinutes;
  return {
    limitMinutes: validateLimitMinutes(limit as number | null) ? (limit as number | null) : null,
    reminderMinutes: typeof rem === 'number' && Number.isInteger(rem) && rem >= 5 && rem <= 240 ? rem : DEFAULT_REMINDER_MINUTES,
  };
}

export function saveSettings(storage: StorageLike, s: SessionSettings): void {
  writeJson(storage, SETTINGS_KEY, s);
}
