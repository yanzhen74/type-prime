import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrainEngine, TRAINING_LEVELS, DRILL_PHASES } from './train-engine.js';
import type { CharResult, TrainProgress, TrainingLevel } from './types.js';

describe('TrainEngine', () => {
  let engine: TrainEngine;

  beforeEach(() => {
    engine = new TrainEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 逐字符模拟用户输入 */
  function type(text: string): void {
    for (const char of text) {
      engine.handleInput({ type: 'char', char });
    }
  }

  function backspace(): void {
    engine.handleInput({ type: 'backspace' });
  }

  function findLevel(id: string): TrainingLevel {
    const level = TRAINING_LEVELS.find((l) => l.id === id);
    if (!level) {
      throw new Error(`Training level "${id}" not found`);
    }
    return level;
  }

  describe('序列生成', () => {
    it('generateKeyDrill 只包含指定层级的键位与空格（random-mix）', () => {
      const level = findLevel('home-left');
      const drill = engine.generateKeyDrill(level, 'random-mix', 200);
      const allowed = new Set([...level.keys, ' ']);
      expect(drill.length).toBeGreaterThan(0);
      for (const ch of drill) {
        expect(allowed.has(ch)).toBe(true);
      }
    });

    it('generateKeyDrill 默认阶段为 random-mix，生成 40 个非空格字符', () => {
      const drill = engine.generateKeyDrill(findLevel('home-left'));
      expect(drill.replace(/ /g, '').length).toBe(40);
      // 含分组空格后总长度略多于 40
      expect(drill.length).toBeGreaterThanOrEqual(40);
    });

    it('generateKeyDrill random-mix 每 4-6 个字符插入一个空格分组', () => {
      const drill = engine.generateKeyDrill(findLevel('home-left'), 'random-mix', 100);
      const groups = drill.split(' ');
      // 100 个字符、每组 4-6 个 => 17-25 组
      expect(groups.length).toBeGreaterThanOrEqual(17);
      expect(groups.length).toBeLessThanOrEqual(25);
      for (let i = 0; i < groups.length; i++) {
        // 非末组长度 4-6；末组因剩余数量截断，至少 1 个
        expect(groups[i].length).toBeGreaterThan(0);
        expect(groups[i].length).toBeLessThanOrEqual(6);
        if (i < groups.length - 1) {
          expect(groups[i].length).toBeGreaterThanOrEqual(4);
        }
      }
    });

    it('keys 为空的层级合并所有层级键位', () => {
      const full = findLevel('full');
      expect(full.keys).toHaveLength(0);
      const drill = engine.generateKeyDrill(full, 'random-mix', 300);
      expect(drill.replace(/ /g, '').length).toBe(300);
      const allKeys = new Set(
        TRAINING_LEVELS.filter((l) => l.keys.length > 0).flatMap((l) => l.keys)
      );
      for (const ch of drill) {
        if (ch === ' ') {
          continue;
        }
        expect(allKeys.has(ch)).toBe(true);
      }
    });

    it('single-repeat 阶段：每个键重复 4 次，循环所有键', () => {
      const level = findLevel('home-left'); // keys: a, s, d, f
      const drill = engine.generateKeyDrill(level, 'single-repeat', 16);
      // 16 字符 = 4 组 x 4 = aaaa ssss dddd ffff
      expect(drill).toBe('aaaa ssss dddd ffff');
    });

    it('single-repeat 阶段：当 length 不是 4 的倍数时截断最后一组', () => {
      const level = findLevel('home-left');
      const drill = engine.generateKeyDrill(level, 'single-repeat', 6);
      // 6 = 4 + 2 => "aaaa ss"
      expect(drill).toBe('aaaa ss');
    });

    it('single-repeat 阶段：循环回绕到开头', () => {
      const level = findLevel('home-left'); // 4 keys
      const drill = engine.generateKeyDrill(level, 'single-repeat', 24);
      // 24 = 6组 x 4 => aaaa ssss dddd ffff aaaa ssss
      expect(drill).toBe('aaaa ssss dddd ffff aaaa ssss');
    });

    it('single-repeat 阶段：只包含指定层级的键位与空格', () => {
      const level = findLevel('home-right'); // keys: j, k, l, ;
      const drill = engine.generateKeyDrill(level, 'single-repeat', 40);
      const allowed = new Set([...level.keys, ' ']);
      expect(drill.replace(/ /g, '').length).toBe(40);
      for (const ch of drill) {
        expect(allowed.has(ch)).toBe(true);
      }
    });

    it('pair-combo 阶段：只包含相邻键对中的字符与空格', () => {
      const level = findLevel('home-left'); // keys: a, s, d, f
      const drill = engine.generateKeyDrill(level, 'pair-combo', 40);
      const allowed = new Set([...level.keys, ' ']);
      expect(drill.replace(/ /g, '').length).toBe(40);
      for (const ch of drill) {
        expect(allowed.has(ch)).toBe(true);
      }
    });

    it('pair-combo 阶段：每组 2-4 个字符（末组可截断）', () => {
      const level = findLevel('home-left');
      const drill = engine.generateKeyDrill(level, 'pair-combo', 40);
      const groups = drill.split(' ');
      for (let i = 0; i < groups.length; i++) {
        if (i < groups.length - 1) {
          expect(groups[i].length).toBeGreaterThanOrEqual(2);
        } else {
          expect(groups[i].length).toBeGreaterThanOrEqual(1);
        }
        expect(groups[i].length).toBeLessThanOrEqual(4);
      }
    });

    it('pair-combo 阶段：每组只包含相邻的两个键', () => {
      const level = findLevel('home-left'); // keys: a, s, d, f => pairs: (a,s), (s,d), (d,f)
      const drill = engine.generateKeyDrill(level, 'pair-combo', 80);
      const groups = drill.split(' ');
      const adjacentPairs = new Set(['as', 'sd', 'df']);
      for (const g of groups) {
        const uniqueChars = [...new Set(g)].sort().join('');
        // 每组只包含 1-2 种字符，且它们是相邻对
        expect(uniqueChars.length).toBeLessThanOrEqual(2);
        if (uniqueChars.length === 2) {
          // 检查是否为相邻对（顺序无关）
          const sorted = [...uniqueChars].sort().join('');
          const validPairs = [...adjacentPairs].map((p) => [...p].sort().join(''));
          expect(validPairs).toContain(sorted);
        }
      }
    });

    it('DRILL_PHASES 包含三个阶段且顺序正确', () => {
      expect(DRILL_PHASES).toHaveLength(3);
      expect(DRILL_PHASES[0].id).toBe('single-repeat');
      expect(DRILL_PHASES[1].id).toBe('pair-combo');
      expect(DRILL_PHASES[2].id).toBe('random-mix');
    });

    it('generateWordPractice 用单个空格连接单词', () => {
      expect(engine.generateWordPractice(['hello', 'world'])).toBe('hello world');
      expect(engine.generateWordPractice(['type', 'prime', 'test'])).toBe('type prime test');
      expect(engine.generateWordPractice(['solo'])).toBe('solo');
      expect(engine.generateWordPractice([])).toBe('');
    });

    it('setArticle 去除首尾空白并保存文本', () => {
      const text = engine.setArticle('  hello world  ');
      expect(text).toBe('hello world');
      expect(engine.getTargetText()).toBe('hello world');
    });
  });

  describe('逐字符比对', () => {
    it('start 后所有 charResults 均为未输入状态', () => {
      engine.start('abc');
      const results = engine.getCharResults();
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ expected: 'a', actual: null, correct: null });
      expect(results[1]).toEqual({ expected: 'b', actual: null, correct: null });
      expect(results[2]).toEqual({ expected: 'c', actual: null, correct: null });
    });

    it('正确输入将对应位置标记为 correct', () => {
      engine.start('abc');
      type('a');
      const results = engine.getCharResults();
      expect(results[0].actual).toBe('a');
      expect(results[0].correct).toBe(true);
      expect(typeof results[0].timestamp).toBe('number');
      // 未输入位置不受影响
      expect(results[1].actual).toBeNull();
      expect(results[1].correct).toBeNull();
    });

    it('错误输入将对应位置标记为 incorrect', () => {
      engine.start('abc');
      type('x');
      const results = engine.getCharResults();
      expect(results[0].expected).toBe('a');
      expect(results[0].actual).toBe('x');
      expect(results[0].correct).toBe(false);
    });
  });

  describe('Backspace', () => {
    it('回退最后输入的字符并重置该位置结果', () => {
      engine.start('abc');
      type('ab');
      expect(engine.getUserInput()).toBe('ab');
      backspace();
      expect(engine.getUserInput()).toBe('a');
      let results = engine.getCharResults();
      expect(results[1].actual).toBeNull();
      expect(results[1].correct).toBeNull();
      // 回退后重新输入可覆盖旧结果（下一个期望字符又是 'b'）
      type('b');
      results = engine.getCharResults();
      expect(results[1].actual).toBe('b');
      expect(results[1].correct).toBe(true);
    });

    it('空输入时 Backspace 无效果', () => {
      engine.start('abc');
      backspace();
      expect(engine.getUserInput()).toBe('');
      const results = engine.getCharResults();
      expect(results[0].actual).toBeNull();
      expect(results[0].correct).toBeNull();
    });
  });

  describe('统计', () => {
    it('getProgress 返回正确的 total/completed/correct', () => {
      engine.start('abcd');
      type('abc');
      const p = engine.getProgress();
      expect(p.total).toBe(4);
      expect(p.completed).toBe(3);
      expect(p.correct).toBe(3);
      expect(p.errors).toHaveLength(0);
    });

    it('getProgress 正确统计错误并计算正确率', () => {
      engine.start('abcd');
      type('axcd'); // a 对、x 错（期望 b）、c 对、d 对
      const p = engine.getProgress();
      expect(p.completed).toBe(4);
      expect(p.correct).toBe(3);
      expect(p.errors).toHaveLength(1);
      expect(p.errors[0]).toMatchObject({ expected: 'b', actual: 'x', correct: false });
      // 正确率 = correct / completed
      expect(p.correct / p.completed).toBeCloseTo(0.75);
    });

    it('根据耗时计算 wpm 与 cpm（1 word = 5 字符）', () => {
      const startedAt = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startedAt) // start 记录开始时间
        .mockReturnValue(startedAt + 30_000); // 此后耗时 0.5 分钟
      engine.start('abcdefghij');
      type('abcde'); // 5 个正确字符
      const p = engine.getProgress();
      expect(p.correct).toBe(5);
      expect(p.wpm).toBeCloseTo(2); // (5 / 5) / 0.5
      expect(p.cpm).toBeCloseTo(10); // 5 / 0.5
    });

    it('耗时为 0 时 wpm 与 cpm 返回 0', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      engine.start('abc');
      type('ab');
      const p = engine.getProgress();
      expect(p.completed).toBe(2);
      expect(p.wpm).toBe(0);
      expect(p.cpm).toBe(0);
    });
  });

  describe('事件回调', () => {
    it('onProgress 在 start 与每次输入时触发', () => {
      const calls: TrainProgress[] = [];
      engine.onProgress((p) => calls.push(p));
      engine.start('abc');
      expect(calls).toHaveLength(1);
      expect(calls[0].completed).toBe(0);
      type('ab');
      expect(calls).toHaveLength(3);
      expect(calls[2].completed).toBe(2);
    });

    it('onMistake 仅在错误输入时触发', () => {
      const mistakes: CharResult[] = [];
      engine.onMistake((c) => mistakes.push(c));
      engine.start('abc');
      type('ab');
      expect(mistakes).toHaveLength(0);
      type('x'); // 期望 c
      expect(mistakes).toHaveLength(1);
      expect(mistakes[0]).toMatchObject({ expected: 'c', actual: 'x', correct: false });
    });

    it('onComplete 在全部输入完成时触发', () => {
      const completions: TrainProgress[] = [];
      engine.onComplete((p) => completions.push(p));
      engine.start('abc');
      type('ab');
      expect(completions).toHaveLength(0);
      type('c');
      expect(completions).toHaveLength(1);
      expect(completions[0].total).toBe(3);
      expect(completions[0].completed).toBe(3);
      expect(engine.isComplete()).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('全部完成后忽略额外输入', () => {
      const progress: TrainProgress[] = [];
      engine.onProgress((p) => progress.push(p));
      engine.start('abc');
      type('abc');
      expect(engine.isComplete()).toBe(true);
      const count = progress.length;
      engine.handleInput({ type: 'char', char: 'x' });
      expect(engine.getUserInput()).toBe('abc');
      expect(progress).toHaveLength(count);
      expect(engine.getCharResults().every((r) => r.actual !== 'x')).toBe(true);
    });

    it('忽略 submit 与 escape 事件', () => {
      engine.start('abc');
      type('a');
      engine.handleInput({ type: 'submit' });
      engine.handleInput({ type: 'escape' });
      expect(engine.getUserInput()).toBe('a');
      expect(engine.getProgress().completed).toBe(1);
    });

    it('reset 清空所有状态', () => {
      engine.start('abc');
      type('ab');
      engine.reset();
      expect(engine.getTargetText()).toBe('');
      expect(engine.getUserInput()).toBe('');
      expect(engine.getCharResults()).toHaveLength(0);
      expect(engine.getNextChar()).toBeNull();
      const p = engine.getProgress();
      expect(p.total).toBe(0);
      expect(p.completed).toBe(0);
      expect(p.correct).toBe(0);
      expect(p.wpm).toBe(0);
      expect(p.cpm).toBe(0);
      expect(p.errors).toHaveLength(0);
    });

    it('getNextChar 返回下一个待输入字符', () => {
      engine.start('abc');
      expect(engine.getNextChar()).toBe('a');
      type('a');
      expect(engine.getNextChar()).toBe('b');
      type('bc');
      expect(engine.getNextChar()).toBeNull();
    });
  });

  describe('换行符自动跳过', () => {
    it('输入行尾字符后自动消耗换行符并标记为已完成', () => {
      engine.start('ab\ncd');
      type('abc'); // 用户不需要按回车，输入 c 时直接对应第二行开头
      expect(engine.getUserInput()).toBe('ab\nc');
      const results = engine.getCharResults();
      expect(results[2]).toMatchObject({ expected: '\n', actual: '\n', correct: true });
      expect(engine.getNextChar()).toBe('d');
    });

    it('连续换行一并自动跳过', () => {
      engine.start('ab\n\ncd');
      type('ab');
      expect(engine.getUserInput()).toBe('ab\n\n');
      expect(engine.getNextChar()).toBe('c');
    });

    it('换行符不计入统计（total/completed/correct 排除 \\n）', () => {
      engine.start('ab\ncd');
      type('abc');
      const p = engine.getProgress();
      expect(p.total).toBe(4);
      expect(p.completed).toBe(3);
      expect(p.correct).toBe(3);
    });

    it('末尾换行自动消耗后直接触发 onComplete', () => {
      const completions: TrainProgress[] = [];
      engine.onComplete((p) => completions.push(p));
      engine.start('abc\n');
      type('abc');
      expect(engine.isComplete()).toBe(true);
      expect(completions).toHaveLength(1);
      expect(completions[0].total).toBe(3);
    });

    it('Backspace 跨过自动消耗的换行符回退到上一行末尾', () => {
      engine.start('ab\ncd');
      type('abc');
      backspace(); // 跨过自动消耗的 \n，回退上一个真实输入字符 c
      expect(engine.getUserInput()).toBe('ab');
      const results = engine.getCharResults();
      expect(results[1]).toMatchObject({ expected: 'b', actual: 'b', correct: true });
      expect(results[2].actual).toBeNull(); // 换行符恢复未输入状态
      expect(results[2].correct).toBeNull();
      expect(results[3].actual).toBeNull();
      // 光标停在换行符上，getNextChar 跳过换行返回下一行开头字符
      expect(engine.getNextChar()).toBe('c');
      // 重新输入时换行符再次被自动消耗
      type('c');
      expect(engine.getUserInput()).toBe('ab\nc');
      expect(engine.getNextChar()).toBe('d');
    });

    it('文本以换行开头时 start 后直接自动消耗', () => {
      engine.start('\nabc');
      expect(engine.getUserInput()).toBe('\n');
      expect(engine.getNextChar()).toBe('a');
      expect(engine.getProgress().total).toBe(3);
    });
  });
});
