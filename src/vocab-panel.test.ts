import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VocabPanel } from './vocab-panel.js';
import { VocabularyBank } from './vocabulary.js';
import { ReviewScheduler } from './review.js';
import { UserProgress } from './storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 词库面板所需的最小 DOM 结构（元素 id 与 index.html 保持一致） */
const FIXTURE = `
  <section id="panel-vocab" class="panel active">
    <select id="vocab-category-filter"></select>
    <input id="vocab-search" />
    <span id="vocab-total-count"></span>
    <button id="vocab-review-btn"></button>
    <span id="vocab-review-count"></span>
    <input id="vocab-word-text" />
    <input id="vocab-word-meaning" />
    <select id="vocab-word-category"></select>
    <select id="vocab-word-difficulty"></select>
    <button id="vocab-submit-btn"></button>
    <button id="vocab-cancel-btn"></button>
    <button id="vocab-export-btn"></button>
    <button id="vocab-import-btn"></button>
    <input id="vocab-import-file" type="file" />
    <table><tbody id="vocab-word-list"></tbody></table>
  </section>
`;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function setup() {
  document.body.innerHTML = FIXTURE;
  const vocabulary = new VocabularyBank();
  const review = new ReviewScheduler();
  const progress = new UserProgress();
  const onStartReview = vi.fn();
  const panel = new VocabPanel({ vocabulary, review, progress, onStartReview });
  return { panel, vocabulary, review, progress, onStartReview };
}

function rowIds(): string[] {
  return [...document.querySelectorAll('#vocab-word-list tr[data-id]')].map(
    (tr) => (tr as HTMLElement).dataset.id ?? ''
  );
}

describe('VocabPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    window.alert = vi.fn() as unknown as typeof window.alert;
    window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
  });

  it('renders default words into the list', () => {
    setup();
    expect(rowIds().length).toBeGreaterThan(0);
    expect(el('vocab-word-list').textContent).toContain('apple');
  });

  it('filters words by category', () => {
    setup();
    const filter = el<HTMLSelectElement>('vocab-category-filter');
    filter.value = 'programming';
    filter.dispatchEvent(new Event('change'));

    const rows = [...document.querySelectorAll('#vocab-word-list tr[data-id]')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.children[2].textContent === '编程术语')).toBe(true);
  });

  it('filters words by search keyword', () => {
    setup();
    const search = el<HTMLInputElement>('vocab-search');
    search.value = 'apple';
    search.dispatchEvent(new Event('input'));
    expect(rowIds()).toEqual(['daily-001']);
  });

  it('adds a word from the form', () => {
    const { vocabulary } = setup();
    el<HTMLInputElement>('vocab-word-text').value = 'keyboard';
    el<HTMLInputElement>('vocab-word-meaning').value = '键盘';
    el<HTMLSelectElement>('vocab-word-category').value = 'programming';
    el<HTMLSelectElement>('vocab-word-difficulty').value = '2';
    el('vocab-submit-btn').click();

    const words = vocabulary.getWords({ categories: ['programming'] });
    expect(words.some((w) => w.text === 'keyboard' && w.meaning === '键盘')).toBe(true);
    expect(el('vocab-word-list').textContent).toContain('keyboard');
  });

  it('rejects adding a word with empty text', () => {
    const { vocabulary } = setup();
    const before = vocabulary.getWords().length;
    el<HTMLInputElement>('vocab-word-text').value = '   ';
    el('vocab-submit-btn').click();
    expect(vocabulary.getWords().length).toBe(before);
    expect(window.alert).toHaveBeenCalled();
  });

  it('deletes a word via the row button', () => {
    const { vocabulary } = setup();
    const btn = document.querySelector(
      '#vocab-word-list tr[data-id="daily-001"] button[data-action="delete"]'
    ) as HTMLButtonElement;
    btn.click();
    expect(vocabulary.getWordById('daily-001')).toBeUndefined();
    expect(rowIds()).not.toContain('daily-001');
  });

  it('shows due review count and triggers onStartReview', () => {
    const { panel, review, onStartReview } = setup();
    review.recordResult('daily-001', true, Date.now() - 2 * DAY_MS);
    panel.refresh();

    expect(el('vocab-review-count').textContent).toBe('1');
    const btn = el<HTMLButtonElement>('vocab-review-btn');
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onStartReview).toHaveBeenCalledWith(['daily-001']);
  });

  it('disables the review button when nothing is due', () => {
    setup();
    expect(el('vocab-review-count').textContent).toBe('0');
    expect(el<HTMLButtonElement>('vocab-review-btn').disabled).toBe(true);
  });

  it('reflects mastery level in the badge', () => {
    const { panel, progress } = setup();
    progress.recordWordResult('daily-001', true);
    panel.refresh();

    const badge = document.querySelector('#vocab-word-list tr[data-id="daily-001"] .mastery-badge');
    expect(badge?.classList.contains('mastery-learning')).toBe(true);
  });
});
