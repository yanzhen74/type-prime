import type { Difficulty, WordEntry } from '../../types.js';

/**
 * 词表构建工具。
 *
 * 各开源/公开词表文件仅导出「词形字符串数组」，由本模块统一映射为 `WordEntry`：
 * - 稳定 id：`${category}-0001` 形式，保证跨版本可去重合并（见 vocabulary.ts 迁移逻辑）；
 * - 难度：按词长映射 1-5（打字练习场景下词长是难度的主要因素）。
 *
 * 后续如需替换为完整词表或补充释义/音标，只需扩展各词表文件的字符串数组，
 * 或在此处接入更精细的难度评估，无需改动消费方。
 */

/** 按词长映射打字难度 1-5（越长越难） */
export function difficultyByLength(text: string): Difficulty {
  const len = text.length;
  if (len <= 4) return 1;
  if (len <= 6) return 2;
  if (len <= 8) return 3;
  if (len <= 11) return 4;
  return 5;
}

/**
 * 将词形数组批量构建为 `WordEntry[]`。
 * @param category 分类 id（同时作为 id 前缀）
 * @param words 词形数组（按数组顺序生成 `-0001` 起的稳定 id）
 */
export function buildEntries(category: string, words: string[]): WordEntry[] {
  return words.map((text, index) => ({
    id: `${category}-${String(index + 1).padStart(4, '0')}`,
    text,
    difficulty: difficultyByLength(text),
    category,
  }));
}
