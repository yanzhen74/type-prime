import { describe, it, expect, beforeEach } from 'vitest';
import { VocabularyBank } from './vocabulary.js';
import type { WordEntry, VocabularyCategory } from './types.js';

describe('VocabularyBank', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default words on first use', () => {
    const bank = new VocabularyBank();
    const words = bank.getWords();
    expect(words.length).toBeGreaterThan(0);
    expect(bank.getCategories().length).toBeGreaterThan(0);
  });

  it('filters words by category', () => {
    const bank = new VocabularyBank();
    const words = bank.getWords({ categories: ['programming'] });
    expect(words.every((w) => w.category === 'programming')).toBe(true);
  });

  it('filters words by difficulty', () => {
    const bank = new VocabularyBank();
    const words = bank.getWords({ difficulties: [1] });
    expect(words.every((w) => w.difficulty === 1)).toBe(true);
  });

  it('limits query results', () => {
    const bank = new VocabularyBank();
    const words = bank.getWords({ limit: 3 });
    expect(words.length).toBe(3);
  });

  it('adds a new word', () => {
    const bank = new VocabularyBank();
    const word = bank.addWord({ text: 'hello', difficulty: 1, category: 'daily' });
    expect(word.id).toBeDefined();
    expect(bank.getWordById(word.id)?.text).toBe('hello');
  });

  it('removes a word', () => {
    const bank = new VocabularyBank();
    const word = bank.addWord({ text: 'remove-me', difficulty: 1, category: 'daily' });
    expect(bank.removeWord(word.id)).toBe(true);
    expect(bank.getWordById(word.id)).toBeUndefined();
  });

  it('validates word entries', () => {
    const bank = new VocabularyBank();
    expect(() => bank.addWord({ text: '', difficulty: 1, category: 'daily' })).toThrow();
    expect(() =>
      // @ts-expect-error 用于验证非法难度值被拦截
      bank.addWord({ text: 'ok', difficulty: 6, category: 'daily' })
    ).toThrow();
  });

  it('imports and exports JSON', () => {
    const bank = new VocabularyBank();
    const category: VocabularyCategory = { id: 'custom', name: '自定义', language: 'zh' };
    const word: WordEntry = { id: 'custom-1', text: '测试', difficulty: 1, category: 'custom' };

    const result = bank.importJSON({ categories: [category], words: [word] });
    expect(result.added).toBe(1);

    const exported = bank.exportJSON();
    expect(exported.categories.some((c) => c.id === 'custom')).toBe(true);
    expect(exported.words.some((w) => w.id === 'custom-1')).toBe(true);
  });

  it('persists changes to localStorage', () => {
    const bank = new VocabularyBank();
    bank.addWord({ text: 'persist', difficulty: 1, category: 'daily' });

    const anotherBank = new VocabularyBank();
    const words = anotherBank.getWords({ categories: ['daily'] });
    expect(words.some((w) => w.text === 'persist')).toBe(true);
  });
});
