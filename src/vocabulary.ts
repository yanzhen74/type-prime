import type { WordEntry, VocabularyCategory, Difficulty } from './types.js';
import { DEFAULT_CATEGORIES, DEFAULT_WORDS } from './assets/vocab/default-words.js';

const STORAGE_KEY = 'typeprime_vocabulary';
const DATA_VERSION = 1;

interface VocabularyData {
  version: number;
  categories: VocabularyCategory[];
  words: WordEntry[];
}

export interface WordQueryOptions {
  categories?: string[];
  difficulties?: Difficulty[];
  limit?: number;
  excludeIds?: string[];
}

export interface ImportResult {
  added: number;
  updated: number;
}

/**
 * 词库管理模块。
 *
 * 负责词库的加载、保存、分类、查询、导入导出。
 * 内置默认词库，并支持用户通过 localStorage 持久化自定义词库。
 */
export class VocabularyBank {
  private data: VocabularyData;

  constructor() {
    this.data = this.load();
  }

  private load(): VocabularyData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as VocabularyData;
        if (parsed.version === DATA_VERSION) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    const initial: VocabularyData = {
      version: DATA_VERSION,
      categories: [...DEFAULT_CATEGORIES],
      words: [...DEFAULT_WORDS],
    };
    this.save(initial);
    return initial;
  }

  private save(data: VocabularyData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private persist(): void {
    this.save(this.data);
  }

  getWords(options: WordQueryOptions = {}): WordEntry[] {
    const { categories, difficulties, limit, excludeIds } = options;
    const excludeSet = new Set(excludeIds ?? []);

    let result = this.data.words.filter((word) => {
      if (excludeSet.has(word.id)) return false;
      if (categories && categories.length > 0 && !categories.includes(word.category)) return false;
      if (difficulties && difficulties.length > 0 && !difficulties.includes(word.difficulty)) {
        return false;
      }
      return true;
    });

    // 简单打乱，避免每次取词顺序固定
    result = this.shuffle(result);

    if (limit && limit > 0) {
      result = result.slice(0, limit);
    }
    return result;
  }

  getWordById(id: string): WordEntry | undefined {
    return this.data.words.find((word) => word.id === id);
  }

  getCategories(): VocabularyCategory[] {
    return [...this.data.categories];
  }

  addCategory(category: VocabularyCategory): void {
    if (this.data.categories.some((c) => c.id === category.id)) {
      throw new Error(`Category "${category.id}" already exists`);
    }
    this.data.categories.push(category);
    this.persist();
  }

  removeCategory(id: string): boolean {
    const hasWords = this.data.words.some((word) => word.category === id);
    if (hasWords) {
      throw new Error(`Cannot remove category "${id}" because it still contains words`);
    }
    const before = this.data.categories.length;
    this.data.categories = this.data.categories.filter((c) => c.id !== id);
    if (this.data.categories.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  addWord(entry: Omit<WordEntry, 'id'> & { id?: string }): WordEntry {
    this.validateWordEntry(entry as WordEntry);

    const id = entry.id ?? this.generateId();
    if (this.data.words.some((word) => word.id === id)) {
      throw new Error(`Word with id "${id}" already exists`);
    }

    const word: WordEntry = { ...entry, id };
    this.data.words.push(word);
    this.persist();
    return word;
  }

  updateWord(entry: WordEntry): boolean {
    this.validateWordEntry(entry);
    const index = this.data.words.findIndex((word) => word.id === entry.id);
    if (index === -1) return false;
    this.data.words[index] = { ...entry };
    this.persist();
    return true;
  }

  removeWord(id: string): boolean {
    const before = this.data.words.length;
    this.data.words = this.data.words.filter((word) => word.id !== id);
    if (this.data.words.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  importJSON(json: Partial<VocabularyData>): ImportResult {
    const words = json.words ?? [];
    const categories = json.categories ?? [];
    let added = 0;
    let updated = 0;

    for (const category of categories) {
      if (!this.data.categories.some((c) => c.id === category.id)) {
        this.data.categories.push(category);
      }
    }

    for (const entry of words) {
      this.validateWordEntry(entry);
      const index = this.data.words.findIndex((word) => word.id === entry.id);
      if (index === -1) {
        this.data.words.push(entry);
        added += 1;
      } else {
        this.data.words[index] = { ...entry };
        updated += 1;
      }
    }

    this.persist();
    return { added, updated };
  }

  exportJSON(): VocabularyData {
    return {
      version: DATA_VERSION,
      categories: [...this.data.categories],
      words: [...this.data.words],
    };
  }

  private validateWordEntry(entry: WordEntry): void {
    if (!entry.text || entry.text.trim() === '') {
      throw new Error('Word text cannot be empty');
    }
    if (!entry.category || entry.category.trim() === '') {
      throw new Error('Word category cannot be empty');
    }
    if (entry.difficulty < 1 || entry.difficulty > 5) {
      throw new Error('Word difficulty must be between 1 and 5');
    }
  }

  private generateId(): string {
    return `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
