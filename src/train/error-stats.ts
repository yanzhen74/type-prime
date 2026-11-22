import type { KeyStats, WordEntry, WordStats } from '../core/types.js';

/**
 * 错误分析纯函数层：把 UserProgress 的 keyStats / wordStats 聚合为
 * 热力图强度、薄弱键位推荐与易错词排行。不触碰 DOM 与存储，便于单测。
 *
 * 口径说明：
 * - keyStats 以 KeyboardEvent.code 为键（如 KeyA / Digit1 / Space）。
 *   历史数据只累计错误次数（correct 恒 0），自错误分析功能起练习完成时
 *   同步累计正确击键，错误率 = wrong / (correct + wrong)。
 * - 样本不足 MIN_SAMPLE 次时热力按比例阻尼，避免「敲 1 次错 1 次」
 *   的键与高频错误键呈现同等热度。
 */

/** 错误率可信的最小样本量（低于此值热力按 attempts/MIN_SAMPLE 阻尼） */
export const MIN_SAMPLE = 5;

/** 错误率达到该值即满热力（0.5 = 50%） */
export const FULL_HEAT_RATE = 0.5;

/** 「练习薄弱键位」一次取前几个错误键 */
export const WEAK_KEY_LIMIT = 6;

/** 易错词列表展示条数 */
export const ERROR_WORD_LIMIT = 10;

/** 单个键位的热力聚合结果 */
export interface KeyHeat {
  code: string;
  correct: number;
  wrong: number;
  /** 总击键数 = correct + wrong */
  attempts: number;
  /** 错误率 0..1（无击键时为 0） */
  errorRate: number;
  /** 热力强度 0..1（错误率映射 + 低样本阻尼），供 CSS rgba alpha 使用 */
  intensity: number;
  /** 已练熟：样本充足且零错误（热力图以绿色微 tint 区分） */
  solid: boolean;
  /** 是否有击键记录 */
  hasData: boolean;
}

/** 全部键位的整体概览 */
export interface KeySummary {
  attempts: number;
  wrong: number;
  /** 整体正确率 0..1（无击键时为 0） */
  accuracy: number;
  /** 有击键记录的键位数 */
  coveredKeys: number;
}

/** 易错词排行条目（词库中已删除的词自动跳过） */
export interface ErrorWordEntry {
  word: WordEntry;
  stats: WordStats;
  errorRate: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 把 keyStats 聚合为 code -> KeyHeat 查找表 */
export function buildKeyHeat(keyStats: Record<string, KeyStats>): Map<string, KeyHeat> {
  const map = new Map<string, KeyHeat>();
  for (const [code, stats] of Object.entries(keyStats)) {
    const correct = Math.max(0, stats.correct ?? 0);
    const wrong = Math.max(0, stats.wrong ?? 0);
    const attempts = correct + wrong;
    const errorRate = attempts > 0 ? wrong / attempts : 0;
    const damping = Math.min(1, attempts / MIN_SAMPLE);
    map.set(code, {
      code,
      correct,
      wrong,
      attempts,
      errorRate,
      intensity: wrong > 0 ? clamp01(errorRate / FULL_HEAT_RATE) * damping : 0,
      solid: attempts >= MIN_SAMPLE && wrong === 0,
      hasData: attempts > 0,
    });
  }
  return map;
}

/** 整体概览（总击键 / 总错误 / 正确率 / 覆盖键位数） */
export function summarizeKeys(keyStats: Record<string, KeyStats>): KeySummary {
  let attempts = 0;
  let wrong = 0;
  let coveredKeys = 0;
  for (const stats of Object.values(keyStats)) {
    const total = Math.max(0, stats.correct ?? 0) + Math.max(0, stats.wrong ?? 0);
    if (total > 0) {
      coveredKeys += 1;
    }
    attempts += total;
    wrong += Math.max(0, stats.wrong ?? 0);
  }
  return {
    attempts,
    wrong,
    accuracy: attempts > 0 ? (attempts - wrong) / attempts : 0,
    coveredKeys,
  };
}

/**
 * 薄弱键位推荐：错误次数降序 → 错误率降序 → code 升序（稳定排序），
 * 只取有错误记录的键，最多 limit 个。
 */
export function weakKeyCodes(heat: Map<string, KeyHeat>, limit = WEAK_KEY_LIMIT): string[] {
  return [...heat.values()]
    .filter((h) => h.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.errorRate - a.errorRate || a.code.localeCompare(b.code))
    .slice(0, limit)
    .map((h) => h.code);
}

/**
 * 易错词排行：错误次数降序 → 错误率降序 → 词文本升序，
 * 只取 wrong > 0 且仍存在于词库的词，最多 limit 个。
 */
export function topErrorWords(
  wordStats: Record<string, WordStats>,
  lookup: (id: string) => WordEntry | undefined,
  limit = ERROR_WORD_LIMIT
): ErrorWordEntry[] {
  const entries: ErrorWordEntry[] = [];
  for (const [id, stats] of Object.entries(wordStats)) {
    const wrong = Math.max(0, stats.wrong ?? 0);
    if (wrong === 0) {
      continue;
    }
    const word = lookup(id);
    if (!word) {
      continue;
    }
    const attempts = Math.max(0, stats.correct ?? 0) + wrong;
    entries.push({ word, stats, errorRate: attempts > 0 ? wrong / attempts : 0 });
  }
  return entries
    .sort(
      (a, b) =>
        b.stats.wrong - a.stats.wrong ||
        b.errorRate - a.errorRate ||
        a.word.text.localeCompare(b.word.text)
    )
    .slice(0, limit);
}

/** 符号键 code -> 基础字符（与 train-panel 的 CHAR_CODE_MAP 互为逆向） */
const SYMBOL_CHAR_OF_CODE: Record<string, string> = {
  Space: ' ',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/**
 * 把统计用的 KeyboardEvent.code 还原为可生成练习序列的字符：
 * KeyA -> a、Digit1 -> 1、Semicolon -> ;、Space -> 空格。
 * 无法识别（如功能键 Enter / 历史脏数据）返回 null。
 */
export function drillCharOf(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  return SYMBOL_CHAR_OF_CODE[code] ?? null;
}
