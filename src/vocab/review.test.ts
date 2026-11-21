import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewScheduler } from './review.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ReviewScheduler', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('schedules a new word for tomorrow after correct answer', () => {
    const scheduler = new ReviewScheduler();
    const now = Date.now();
    const state = scheduler.recordResult('w1', true, now);

    expect(state.repetition).toBe(1);
    expect(state.interval).toBe(1);
    expect(state.dueDate).toBe(now + DAY_MS);
  });

  it('increases interval on consecutive correct answers', () => {
    const scheduler = new ReviewScheduler();
    const now = Date.now();

    const s1 = scheduler.recordResult('w1', true, now);
    expect(s1.interval).toBe(1);

    const s2 = scheduler.recordResult('w1', true, now + DAY_MS);
    expect(s2.interval).toBe(6);

    const s3 = scheduler.recordResult('w1', true, now + 7 * DAY_MS);
    expect(s3.interval).toBeGreaterThanOrEqual(6);
  });

  it('resets interval after wrong answer', () => {
    const scheduler = new ReviewScheduler();
    const now = Date.now();

    scheduler.recordResult('w1', true, now);
    scheduler.recordResult('w1', true, now + DAY_MS);
    const wrong = scheduler.recordResult('w1', false, now + 7 * DAY_MS);

    expect(wrong.repetition).toBe(0);
    expect(wrong.interval).toBe(1);
  });

  it('returns due reviews sorted by due date', () => {
    const scheduler = new ReviewScheduler();
    const now = Date.now();

    scheduler.recordResult('w1', true, now - 2 * DAY_MS);
    scheduler.recordResult('w2', true, now - DAY_MS);
    scheduler.recordResult('w3', true, now + DAY_MS);

    const due = scheduler.getDueReviews(now);
    expect(due).toContain('w1');
    expect(due).toContain('w2');
    expect(due).not.toContain('w3');
    expect(due.indexOf('w1')).toBeLessThan(due.indexOf('w2'));
  });

  it('imports and exports review data', () => {
    const scheduler = new ReviewScheduler();
    scheduler.recordResult('w1', true);

    const exported = scheduler.exportJSON();
    expect(exported.states['w1']).toBeDefined();

    const another = new ReviewScheduler();
    another.importJSON(exported);
    expect(another.getState('w1')).toEqual(exported.states['w1']);
  });
});
