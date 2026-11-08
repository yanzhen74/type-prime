import type { WordEntry, VocabularyCategory } from '../../types.js';
import { buildEntries } from './word-utils.js';
import { FREQUENCY_WORDS } from './frequency-words.js';
import { CET4_WORDS } from './cet4-words.js';
import { CET6_WORDS } from './cet6-words.js';

export const DEFAULT_CATEGORIES: VocabularyCategory[] = [
  { id: 'daily', name: '日常英语', language: 'en', description: '日常生活常用单词' },
  { id: 'programming', name: '编程术语', language: 'en', description: '编程与计算机常用术语' },
  {
    id: 'frequency',
    name: '通用高频词',
    language: 'en',
    description: '英语最高频常用词（精简子集）',
  },
  { id: 'cet4', name: '大学英语四级', language: 'en', description: 'CET-4 核心词（精简子集）' },
  { id: 'cet6', name: '大学英语六级', language: 'en', description: 'CET-6 核心词（精简子集）' },
];

export const DEFAULT_WORDS: WordEntry[] = [
  // 日常英语（难度 1-2）
  { id: 'daily-001', text: 'apple', difficulty: 1, category: 'daily', tags: ['fruit'] },
  { id: 'daily-002', text: 'banana', difficulty: 1, category: 'daily', tags: ['fruit'] },
  { id: 'daily-003', text: 'grape', difficulty: 1, category: 'daily', tags: ['fruit'] },
  { id: 'daily-004', text: 'lemon', difficulty: 1, category: 'daily', tags: ['fruit'] },
  { id: 'daily-005', text: 'peach', difficulty: 1, category: 'daily', tags: ['fruit'] },
  { id: 'daily-006', text: 'tiger', difficulty: 1, category: 'daily', tags: ['animal'] },
  { id: 'daily-007', text: 'rabbit', difficulty: 1, category: 'daily', tags: ['animal'] },
  { id: 'daily-008', text: 'eagle', difficulty: 2, category: 'daily', tags: ['animal'] },
  { id: 'daily-009', text: 'dolphin', difficulty: 2, category: 'daily', tags: ['animal'] },
  { id: 'daily-010', text: 'penguin', difficulty: 2, category: 'daily', tags: ['animal'] },
  { id: 'daily-011', text: 'happy', difficulty: 1, category: 'daily', tags: ['emotion'] },
  { id: 'daily-012', text: 'bright', difficulty: 2, category: 'daily', tags: ['emotion'] },
  { id: 'daily-013', text: 'strong', difficulty: 1, category: 'daily', tags: ['emotion'] },
  { id: 'daily-014', text: 'gentle', difficulty: 2, category: 'daily', tags: ['emotion'] },
  { id: 'daily-015', text: 'clever', difficulty: 2, category: 'daily', tags: ['emotion'] },
  { id: 'daily-016', text: 'planet', difficulty: 2, category: 'daily', tags: ['space'] },
  { id: 'daily-017', text: 'rocket', difficulty: 2, category: 'daily', tags: ['space'] },
  { id: 'daily-018', text: 'galaxy', difficulty: 2, category: 'daily', tags: ['space'] },
  { id: 'daily-019', text: 'comet', difficulty: 2, category: 'daily', tags: ['space'] },
  { id: 'daily-020', text: 'nebula', difficulty: 3, category: 'daily', tags: ['space'] },

  // 编程术语（难度 2-4）
  { id: 'prog-001', text: 'function', difficulty: 2, category: 'programming', tags: ['keyword'] },
  { id: 'prog-002', text: 'variable', difficulty: 2, category: 'programming', tags: ['keyword'] },
  { id: 'prog-003', text: 'array', difficulty: 2, category: 'programming', tags: ['keyword'] },
  { id: 'prog-004', text: 'object', difficulty: 2, category: 'programming', tags: ['keyword'] },
  { id: 'prog-005', text: 'return', difficulty: 2, category: 'programming', tags: ['keyword'] },
  { id: 'prog-006', text: 'async', difficulty: 3, category: 'programming', tags: ['keyword'] },
  { id: 'prog-007', text: 'await', difficulty: 3, category: 'programming', tags: ['keyword'] },
  { id: 'prog-008', text: 'promise', difficulty: 3, category: 'programming', tags: ['keyword'] },
  { id: 'prog-009', text: 'module', difficulty: 3, category: 'programming', tags: ['keyword'] },
  { id: 'prog-010', text: 'typescript', difficulty: 3, category: 'programming', tags: ['keyword'] },

  // 通用高频词 / 四六级核心词（由词形数组按词长映射难度批量构建，id 形如 cet4-0001）
  ...buildEntries('frequency', FREQUENCY_WORDS),
  ...buildEntries('cet4', CET4_WORDS),
  ...buildEntries('cet6', CET6_WORDS),
];
