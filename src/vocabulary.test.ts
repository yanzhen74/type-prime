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

  it('migrates v1 data to v2: keeps user words, merges new defaults, no duplicate ids', () => {
    // 构造 v1 存档：旧默认分类 + 用户自定义分类与单词，且用户改过 daily-001 的文本
    const v1 = {
      version: 1,
      categories: [
        { id: 'daily', name: '日常英语', language: 'en' },
        { id: 'programming', name: '编程术语', language: 'en' },
        { id: 'mine', name: '我的分类', language: 'en' },
      ],
      words: [
        { id: 'daily-001', text: 'user-modified', difficulty: 1, category: 'daily' },
        { id: 'mine-1', text: '自定义词', difficulty: 2, category: 'mine' },
      ],
    };
    localStorage.setItem('typeprime_vocabulary', JSON.stringify(v1));

    const bank = new VocabularyBank();
    const exported = bank.exportJSON();

    // 版本升到 2（内存与 localStorage 均已回写）
    expect(exported.version).toBe(2);
    const rawAfter = JSON.parse(localStorage.getItem('typeprime_vocabulary') ?? '{}');
    expect(rawAfter.version).toBe(2);

    // 用户自定义分类与单词保留
    expect(exported.categories.some((c) => c.id === 'mine')).toBe(true);
    expect(exported.words.some((w) => w.id === 'mine-1' && w.text === '自定义词')).toBe(true);
    // 用户改过的默认词不被覆盖
    expect(exported.words.find((w) => w.id === 'daily-001')?.text).toBe('user-modified');

    // 新默认分类并入
    for (const id of ['frequency', 'cet4', 'cet6']) {
      expect(exported.categories.some((c) => c.id === id)).toBe(true);
    }
    // 新默认词并入
    expect(exported.words.some((w) => w.id === 'frequency-0001')).toBe(true);
    expect(exported.words.some((w) => w.id === 'cet4-0001')).toBe(true);

    // 无重复 id
    const ids = exported.words.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
