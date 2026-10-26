import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, MemoryStorage, acknowledgeReminder, evaluateSession, formatDuration, loadSettings, saveSettings,
  startSession, validateLimitMinutes,
} from '../src/engine';
import { compliance, SETTINGS_KEY } from '../src/engine';

const MIN = 60_000;

describe('session reminders and limits', () => {
  it('no limit by default; reminder after 30 minutes, again after acknowledge', () => {
    const clock = startSession(0);
    expect(evaluateSession(clock, DEFAULT_SETTINGS, 29 * MIN).reminderDue).toBe(false);
    const s = evaluateSession(clock, DEFAULT_SETTINGS, 30 * MIN);
    expect(s.reminderDue).toBe(true);
    expect(s.limitReached).toBe(false);
    expect(s.remainingMs).toBeNull();
    const c2 = acknowledgeReminder(clock, 30 * MIN);
    expect(evaluateSession(c2, DEFAULT_SETTINGS, 59 * MIN).reminderDue).toBe(false);
    expect(evaluateSession(c2, DEFAULT_SETTINGS, 60 * MIN).reminderDue).toBe(true);
  });
  it('enforces a self-imposed limit', () => {
    const settings = { limitMinutes: 20, reminderMinutes: 30 };
    const clock = startSession(1000);
    expect(evaluateSession(clock, settings, 1000 + 19 * MIN).limitReached).toBe(false);
    expect(evaluateSession(clock, settings, 1000 + 19 * MIN).remainingMs).toBe(MIN);
    const s = evaluateSession(clock, settings, 1000 + 20 * MIN);
    expect(s.limitReached).toBe(true);
    expect(s.remainingMs).toBe(0);
    expect(s.reminderDue).toBe(false);
  });
  it('validates limits and persists settings', () => {
    expect(validateLimitMinutes(null)).toBe(true);
    expect(validateLimitMinutes(30)).toBe(true);
    expect(validateLimitMinutes(1)).toBe(false);
    expect(validateLimitMinutes(10_000)).toBe(false);
    expect(validateLimitMinutes(10.5)).toBe(false);
    const st = new MemoryStorage();
    saveSettings(st, { limitMinutes: 45, reminderMinutes: 15 });
    expect(loadSettings(st)).toEqual({ limitMinutes: 45, reminderMinutes: 15 });
    st.setItem(SETTINGS_KEY, JSON.stringify({ limitMinutes: -3, reminderMinutes: 'x' }));
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });
  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});

describe('compliance copy', () => {
  it('footer text is verbatim', () => {
    expect(compliance.FOOTER_TEXT).toBe(
      'Free-to-play. Play chips have no cash value and cannot be purchased or redeemed. Simulated gambling does not guarantee real-money success.',
    );
  });
  it('minimum age is 18 and Alberta helpline is listed', () => {
    expect(compliance.MIN_AGE).toBe(18);
    expect(compliance.HELP_RESOURCES.some((h) => h.phone === '1-866-332-2322')).toBe(true);
    expect(compliance.HELP_RESOURCES.every((h) => h.url.startsWith('https://'))).toBe(true);
  });
  it('does not reference non-Alberta (Ontario) resources', () => {
    const text = JSON.stringify(compliance.HELP_RESOURCES);
    expect(text).not.toMatch(/playsmart|connex/i);
  });
});
