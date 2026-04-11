import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from './buildTimeline.js';

// Helper: create a session at hour offsets from midnight
const HOUR = 3600000;
const MIDNIGHT = new Date('2026-04-10T05:00:00Z').getTime(); // midnight CDT
const END_OF_DAY = MIDNIGHT + 24 * HOUR;

function session(startHour, endHour, focusLevel = 2, title = 'task') {
  return {
    startedAt: new Date(MIDNIGHT + startHour * HOUR).toISOString(),
    endedAt:   new Date(MIDNIGHT + endHour * HOUR).toISOString(),
    focusLevel,
    taskTitle: title,
    activityContext: 'cultivo',
  };
}

// Session that crosses midnight (starts before this day, ends during it)
function crossMidnightSession(startHourBefore, endHour, focusLevel = 0, title = 'sleeping') {
  return {
    startedAt: new Date(MIDNIGHT - startHourBefore * HOUR).toISOString(),
    endedAt:   new Date(MIDNIGHT + endHour * HOUR).toISOString(),
    focusLevel,
    taskTitle: title,
    activityContext: 'rest',
  };
}

describe('buildTimeline', () => {
  describe('basic timeline', () => {
    it('creates a timeline from sessions', () => {
      const { timeline, summary } = buildTimeline(
        [session(9, 12), session(13, 17)],
        MIDNIGHT, END_OF_DAY
      );
      const tracked = timeline.filter(s => !s.isGap);
      assert.equal(tracked.length, 2);
      assert.equal(summary.pctTracked, 29); // 7h / 24h
    });

    it('fills gaps between sessions', () => {
      const { timeline } = buildTimeline(
        [session(9, 12), session(14, 17)],
        MIDNIGHT, END_OF_DAY
      );
      const gaps = timeline.filter(s => s.isGap);
      assert.ok(gaps.length >= 2); // gap before 9am, gap 12-14, gap after 17
    });

    it('returns 0% for no sessions', () => {
      const { summary } = buildTimeline([], MIDNIGHT, END_OF_DAY);
      assert.equal(summary.pctTracked, 0);
      assert.equal(summary.pctActive, 0);
      assert.equal(summary.focusedMins, 0);
    });
  });

  describe('percentages never exceed 100', () => {
    it('pctTracked <= 100 even with overlapping sessions', () => {
      const { summary } = buildTimeline(
        [session(9, 17), session(10, 15), session(12, 18)],
        MIDNIGHT, END_OF_DAY
      );
      assert.ok(summary.pctTracked <= 100, `pctTracked was ${summary.pctTracked}`);
    });

    it('pctActive <= 100 even with overlapping active sessions', () => {
      const { summary } = buildTimeline(
        [session(9, 17, 3), session(10, 15, 4), session(12, 18, 5)],
        MIDNIGHT, END_OF_DAY
      );
      assert.ok(summary.pctActive <= 100, `pctActive was ${summary.pctActive}`);
    });

    it('pctTracked <= 100 with full-day overlapping sessions', () => {
      const { summary } = buildTimeline(
        [session(0, 24, 0, 'sleeping'), session(0, 24, 3, 'working')],
        MIDNIGHT, END_OF_DAY
      );
      assert.ok(summary.pctTracked <= 100, `pctTracked was ${summary.pctTracked}`);
    });
  });

  describe('cross-midnight sessions', () => {
    it('clips sessions starting before midnight to dayStart', () => {
      const { timeline } = buildTimeline(
        [crossMidnightSession(3, 8)], // started 3h before midnight, ends 8am
        MIDNIGHT, END_OF_DAY
      );
      const tracked = timeline.filter(s => !s.isGap);
      assert.equal(tracked.length, 1);
      assert.equal(tracked[0].startMs, MIDNIGHT); // clipped to midnight
      assert.equal(tracked[0].endMs, MIDNIGHT + 8 * HOUR); // ends at 8am
    });

    it('clips sessions ending after end-of-day', () => {
      const { timeline } = buildTimeline(
        [session(22, 26, 0, 'sleeping')], // 10pm to 2am next day
        MIDNIGHT, END_OF_DAY
      );
      const tracked = timeline.filter(s => !s.isGap);
      assert.equal(tracked.length, 1);
      assert.equal(tracked[0].endMs, END_OF_DAY); // clipped to midnight
    });

    it('pctTracked correct with cross-midnight sleep', () => {
      // Sleep from 10pm yesterday to 7am today = 7h on this day
      // Work from 9am to 5pm = 8h
      // Total = 15h / 24h = 63%
      const { summary } = buildTimeline(
        [crossMidnightSession(2, 7, 0, 'sleeping'), session(9, 17, 3, 'work')],
        MIDNIGHT, END_OF_DAY
      );
      assert.equal(summary.pctTracked, 63);
      assert.ok(summary.pctActive <= 100, `pctActive was ${summary.pctActive}`);
    });

    it('overlapping cross-midnight sessions do not exceed 100%', () => {
      // Two sessions both crossing midnight and overlapping
      const { summary } = buildTimeline(
        [
          crossMidnightSession(2, 8, 0, 'sleeping'),
          crossMidnightSession(1, 6, 1, 'resting'),
          session(6, 22, 3, 'work'),
        ],
        MIDNIGHT, END_OF_DAY
      );
      assert.ok(summary.pctTracked <= 100, `pctTracked was ${summary.pctTracked}`);
      assert.ok(summary.pctActive <= 100, `pctActive was ${summary.pctActive}`);
    });
  });

  describe('display range is midnight to midnight', () => {
    it('timeline spans full 24h when sessions fill the day', () => {
      const { timeline } = buildTimeline(
        [session(0, 24)],
        MIDNIGHT, END_OF_DAY
      );
      const first = timeline[0];
      const last = timeline[timeline.length - 1];
      assert.equal(first.startMs, MIDNIGHT);
      assert.equal(last.endMs, END_OF_DAY);
    });

    it('gap inserted from midnight to first session', () => {
      const { timeline } = buildTimeline(
        [session(9, 17)],
        MIDNIGHT, END_OF_DAY
      );
      assert.equal(timeline[0].isGap, true);
      assert.equal(timeline[0].startMs, MIDNIGHT);
    });

    it('gap inserted from last session to end of day', () => {
      const { timeline } = buildTimeline(
        [session(9, 17)],
        MIDNIGHT, END_OF_DAY
      );
      const last = timeline[timeline.length - 1];
      assert.equal(last.isGap, true);
      assert.equal(last.endMs, END_OF_DAY);
    });
  });

  describe('focused minutes calculation', () => {
    it('sums focus×minutes for f>0 sessions', () => {
      // 2h at f:3 = 360 focused minutes, 1h at f:0 = 0
      const { summary } = buildTimeline(
        [session(9, 11, 3, 'deep work'), session(11, 12, 0, 'idle')],
        MIDNIGHT, END_OF_DAY
      );
      assert.equal(summary.focusedMins, 360);
    });

    it('does not double-count overlapping focused sessions', () => {
      // Two overlapping 2h sessions at f:3 and f:4
      // Merged: 3h (9-12). Focus = max(3,4)=4 × 3h = 720
      const { summary } = buildTimeline(
        [session(9, 11, 3), session(10, 12, 4)],
        MIDNIGHT, END_OF_DAY
      );
      assert.equal(summary.focusedMins, 720);
      assert.ok(summary.pctActive <= 100);
    });
  });
});
