import { describe, it, expect } from 'vitest';
import {
  buildKeyHeat,
  summarizeKeys,
  weakKeyCodes,
  topErrorWords,
  drillCharOf,
  MIN_SAMPLE,
} from './error-stats.js';
import type { KeyStats, WordEntry, WordStats } from '../core/types.js';

function wordStats(partial: Partial<WordStats>): WordStats {
  return {
    encounters: 0,
    correct: 0,
    wrong: 0,
    lastReview: 0,
    nextReview: 0,
    mastery: 'learning',
    ...partial,
  };
}

function entry(id: string, text: string): WordEntry {
  return { id, text, difficulty: 1, category: 'daily' };
}

describe('buildKeyHeat 热力聚合', () => {
  it('错误率 = wrong / (correct + wrong)，热力按 50% 满档映射', () => {
    const heat = buildKeyHeat({ KeyA: { correct: 15, wrong: 5 } });
    const a = heat.get('KeyA')!;
    expect(a.attempts).toBe(20);
    expect(a.errorRate).toBeCloseTo(0.25);
    expect(a.intensity).toBeCloseTo(0.5);
    expect(a.hasData).toBe(true);
    expect(a.solid).toBe(false);
  });

  it('错误率超过 50% 时热力封顶为 1', () => {
    const heat = buildKeyHeat({ KeyB: { correct: 2, wrong: 8 } });
    expect(heat.get('KeyB')!.intensity).toBe(1);
  });

  it('样本不足 MIN_SAMPLE 时热力按比例阻尼', () => {
    const heat = buildKeyHeat({ KeyC: { correct: 0, wrong: 1 } });
    const c = heat.get('KeyC')!;
    expect(c.errorRate).toBe(1);
    expect(c.intensity).toBeCloseTo(1 / MIN_SAMPLE);
  });

  it('样本充足且零错误判为已练熟（solid），热力为 0', () => {
    const heat = buildKeyHeat({
      KeyD: { correct: MIN_SAMPLE, wrong: 0 },
      KeyE: { correct: MIN_SAMPLE - 1, wrong: 0 },
    });
    expect(heat.get('KeyD')!.solid).toBe(true);
    expect(heat.get('KeyD')!.intensity).toBe(0);
    expect(heat.get('KeyE')!.solid).toBe(false);
  });

  it('历史脏数据（负数/缺字段）按 0 兜底，不产生 NaN', () => {
    const heat = buildKeyHeat({
      KeyF: { correct: -3, wrong: 2 },
      KeyG: {} as KeyStats,
    });
    expect(heat.get('KeyF')!.correct).toBe(0);
    expect(heat.get('KeyF')!.errorRate).toBe(1);
    expect(heat.get('KeyG')!.hasData).toBe(false);
    expect(heat.get('KeyG')!.intensity).toBe(0);
  });
});

describe('summarizeKeys 整体概览', () => {
  it('汇总总击键/错误/正确率/覆盖键位数', () => {
    const summary = summarizeKeys({
      KeyA: { correct: 8, wrong: 2 },
      KeyB: { correct: 0, wrong: 3 },
      KeyC: { correct: 0, wrong: 0 },
    });
    expect(summary.attempts).toBe(13);
    expect(summary.wrong).toBe(5);
    expect(summary.accuracy).toBeCloseTo(8 / 13);
    expect(summary.coveredKeys).toBe(2);
  });

  it('空统计返回零值而非 NaN', () => {
    const summary = summarizeKeys({});
    expect(summary).toEqual({ attempts: 0, wrong: 0, accuracy: 0, coveredKeys: 0 });
  });
});

describe('weakKeyCodes 薄弱键位推荐', () => {
  it('按错误次数降序 → 错误率降序 → code 升序，且只取有错误的键', () => {
    const heat = buildKeyHeat({
      KeyA: { correct: 0, wrong: 3 },
      KeyB: { correct: 0, wrong: 5 },
      KeyC: { correct: 1, wrong: 3 },
      KeyD: { correct: 9, wrong: 0 },
      KeyE: { correct: 0, wrong: 3 },
    });
    // B(5) 最先；A/C/E 同为 3 次错误，按错误率 A=E(100%) > C(75%)，再按 code A < E
    expect(weakKeyCodes(heat)).toEqual(['KeyB', 'KeyA', 'KeyE', 'KeyC']);
  });

  it('limit 截断推荐数量', () => {
    const heat = buildKeyHeat({
      KeyA: { correct: 0, wrong: 1 },
      KeyB: { correct: 0, wrong: 2 },
      KeyC: { correct: 0, wrong: 3 },
    });
    expect(weakKeyCodes(heat, 2)).toEqual(['KeyC', 'KeyB']);
  });
});

describe('topErrorWords 易错词排行', () => {
  const words = [entry('w1', 'apple'), entry('w2', 'banana'), entry('w3', 'cherry')];
  const lookup = (id: string): WordEntry | undefined => words.find((w) => w.id === id);

  it('过滤零错误词与词库中已删除的词，按错误次数降序', () => {
    const stats = {
      w1: wordStats({ encounters: 4, correct: 3, wrong: 1 }),
      w2: wordStats({ encounters: 6, correct: 1, wrong: 5 }),
      w3: wordStats({ encounters: 2, correct: 2, wrong: 0 }),
      deleted: wordStats({ encounters: 3, wrong: 3 }),
    };
    const result = topErrorWords(stats, lookup);
    expect(result.map((r) => r.word.id)).toEqual(['w2', 'w1']);
    expect(result[0].errorRate).toBeCloseTo(5 / 6);
  });

  it('错误次数相同时按错误率降序、再按词文本升序', () => {
    const stats = {
      w1: wordStats({ correct: 0, wrong: 2 }),
      w2: wordStats({ correct: 8, wrong: 2 }),
      w3: wordStats({ correct: 0, wrong: 2 }),
    };
    const result = topErrorWords(stats, lookup);
    expect(result.map((r) => r.word.id)).toEqual(['w1', 'w3', 'w2']);
  });

  it('limit 截断排行条数', () => {
    const stats = {
      w1: wordStats({ wrong: 1 }),
      w2: wordStats({ wrong: 2 }),
      w3: wordStats({ wrong: 3 }),
    };
    expect(topErrorWords(stats, lookup, 2).map((r) => r.word.id)).toEqual(['w3', 'w2']);
  });
});

describe('drillCharOf 统计键名还原练习字符', () => {
  it('字母 code 还原为小写字符', () => {
    expect(drillCharOf('KeyA')).toBe('a');
    expect(drillCharOf('KeyZ')).toBe('z');
  });

  it('数字与符号 code 还原为基础字符', () => {
    expect(drillCharOf('Digit1')).toBe('1');
    expect(drillCharOf('Digit0')).toBe('0');
    expect(drillCharOf('Semicolon')).toBe(';');
    expect(drillCharOf('Backquote')).toBe('`');
    expect(drillCharOf('Space')).toBe(' ');
  });

  it('无法识别的键名返回 null', () => {
    expect(drillCharOf('Enter')).toBeNull();
    expect(drillCharOf('ShiftLeft')).toBeNull();
    expect(drillCharOf('KeyAB')).toBeNull();
    expect(drillCharOf('')).toBeNull();
  });
});
