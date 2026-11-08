import type { CharResult, DrillPhase, TrainProgress, TrainingLevel, TypingEvent } from './types.js';

/** 键位专项训练序列的默认长度（不含空格） */
const DEFAULT_DRILL_LENGTH = 40;

/** 随机分组的最小字符数 */
const GROUP_MIN = 4;
/** 随机分组的最大字符数 */
const GROUP_MAX = 6;

/** 单键重复阶段每个键的重复次数 */
const SINGLE_REPEAT = 4;
/** 双键组合阶段的分组字符数范围 */
const PAIR_GROUP_MIN = 2;
const PAIR_GROUP_MAX = 4;

/** WPM 标准换算：1 word = 5 characters */
const CHARS_PER_WORD = 5;

/** 一分钟的毫秒数 */
const MS_PER_MINUTE = 60_000;

/** 练习阶段元数据（用于 UI 展示） */
export const DRILL_PHASES: { id: DrillPhase; name: string; description: string }[] = [
  { id: 'single-repeat', name: '单键重复', description: '每个键重复4次，熟悉键位位置' },
  { id: 'pair-combo', name: '双键组合', description: '相邻键位两两组合，练习手指切换' },
  { id: 'random-mix', name: '随机混合', description: '所有键位随机出现，综合练习' },
];

/** 内置分层键位训练层级（顺序即推荐训练顺序） */
export const TRAINING_LEVELS: TrainingLevel[] = [
  {
    id: 'home-left',
    name: 'Home Row 左手',
    keys: ['a', 's', 'd', 'f'],
    description: '左手基准键位',
  },
  {
    id: 'home-right',
    name: 'Home Row 右手',
    keys: ['j', 'k', 'l', ';'],
    description: '右手基准键位',
  },
  {
    id: 'home-full',
    name: 'Home Row 全部',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
    description: '基准行完整键位',
  },
  {
    id: 'top-row',
    name: '上排字母',
    keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    description: '上排字母键位',
  },
  {
    id: 'bottom-row',
    name: '下排字母',
    keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    description: '下排字母键位',
  },
  {
    id: 'numbers',
    name: '数字行',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    description: '数字键位',
  },
  {
    id: 'symbols',
    name: '常用符号',
    keys: ['-', '=', '[', ']', '\\', ',', '.', '/', '`', "'"],
    description: '常用符号键位',
  },
  {
    id: 'full',
    name: '全键盘混合',
    keys: [],
    description: '所有键位随机混合（keys 为空表示使用全部）',
  },
];

/**
 * 打字练习引擎。
 *
 * 负责三种练习模式（键位专项 / 单词 / 文章）的目标文本生成，
 * 以及练习过程中的逐字符比对、统计与事件分发。
 * 输入事件由 TypingEngine 标准化后经 handleInput 送入。
 */
export class TrainEngine {
  private targetText: string = '';
  private userInput: string = '';
  private startTime: number | null = null;
  private charResults: CharResult[] = [];

  // 回调
  private onProgressCb?: (p: TrainProgress) => void;
  private onMistakeCb?: (c: CharResult) => void;
  private onCompleteCb?: (p: TrainProgress) => void;

  /** 注册进度回调（start 与每次有效输入后触发） */
  onProgress(cb: (p: TrainProgress) => void): void {
    this.onProgressCb = cb;
  }

  /** 注册错误回调（每次输错一个字符时触发） */
  onMistake(cb: (c: CharResult) => void): void {
    this.onMistakeCb = cb;
  }

  /** 注册完成回调（目标文本全部输入完成时触发） */
  onComplete(cb: (p: TrainProgress) => void): void {
    this.onCompleteCb = cb;
  }

  // ------------------------------------------------------------------
  // 序列生成
  // ------------------------------------------------------------------

  /**
   * 生成键位专项训练序列。
   *
   * 支持三种练习阶段（DrillPhase）：
   * - single-repeat：逐键重复 4 次
   * - pair-combo：相邻键位两两组合
   * - random-mix：随机混合（默认，兼容旧调用）
   *
   * length 表示不含空格的目标字符数（默认 40）。
   * level.keys 为空时使用全部层级键位的并集。
   */
  generateKeyDrill(
    level: TrainingLevel,
    phase: DrillPhase = 'random-mix',
    length = DEFAULT_DRILL_LENGTH
  ): string {
    const keys = level.keys.length > 0 ? level.keys : allLevelKeys();
    if (keys.length === 0 || length <= 0) {
      return '';
    }

    switch (phase) {
      case 'single-repeat':
        return this.generateSingleRepeat(keys, length);
      case 'pair-combo':
        return this.generatePairCombo(keys, length);
      default:
        return this.generateRandomMix(keys, length);
    }
  }

  /**
   * 阶段 1 - 单键重复。
   * 从 keys 中逐个取键，每键重复 SINGLE_REPEAT 次为一组，
   * 循环所有键直到达到 length。
   */
  private generateSingleRepeat(keys: string[], length: number): string {
    const groups: string[] = [];
    let produced = 0;
    let keyIdx = 0;
    while (produced < length) {
      const key = keys[keyIdx % keys.length];
      const remaining = length - produced;
      const count = Math.min(SINGLE_REPEAT, remaining);
      groups.push(key.repeat(count));
      produced += count;
      keyIdx++;
    }
    return groups.join(' ');
  }

  /**
   * 阶段 2 - 相邻双键组合。
   * 从 keys 中取相邻两键为一对，每组重复该对 1-2 次（2-4 字符），
   * 循环所有相邻对直到达到 length。
   */
  private generatePairCombo(keys: string[], length: number): string {
    // 构建相邻键对列表
    const pairs: [string, string][] = [];
    for (let i = 0; i < keys.length - 1; i++) {
      pairs.push([keys[i], keys[i + 1]]);
    }
    // 若 keys 只有 1 个，退化为单键重复
    if (pairs.length === 0) {
      return this.generateSingleRepeat(keys, length);
    }

    const groups: string[] = [];
    let produced = 0;
    let pairIdx = 0;
    while (produced < length) {
      const [a, b] = pairs[pairIdx % pairs.length];
      const remaining = length - produced;
      const groupSize = Math.min(randomInt(PAIR_GROUP_MIN, PAIR_GROUP_MAX), remaining);
      // 按 groupSize 交替填充 a 和 b
      let group = '';
      for (let i = 0; i < groupSize; i++) {
        group += i % 2 === 0 ? a : b;
      }
      groups.push(group);
      produced += groupSize;
      pairIdx++;
    }
    return groups.join(' ');
  }

  /**
   * 阶段 3 - 随机混合（原有行为）。
   * 从 keys 中随机抽取字符，每 4-6 个字符插入一个空格分组。
   */
  private generateRandomMix(keys: string[], length: number): string {
    const groups: string[] = [];
    let produced = 0;
    while (produced < length) {
      const remaining = length - produced;
      const groupSize = Math.min(randomInt(GROUP_MIN, GROUP_MAX), remaining);
      let group = '';
      for (let i = 0; i < groupSize; i++) {
        group += keys[Math.floor(Math.random() * keys.length)];
      }
      groups.push(group);
      produced += groupSize;
    }
    return groups.join(' ');
  }

  /** 用单个空格连接单词列表，生成单词练习文本 */
  generateWordPractice(words: string[]): string {
    return words.join(' ');
  }

  /** 设置文章练习文本（去除首尾空白）并返回 */
  setArticle(text: string): string {
    this.targetText = text.trim();
    return this.targetText;
  }

  // ------------------------------------------------------------------
  // 练习流程
  // ------------------------------------------------------------------

  /** 开始一段练习：重置输入状态并按目标文本初始化逐字符比对结果 */
  start(text: string): void {
    this.targetText = text;
    this.userInput = '';
    this.startTime = Date.now();
    this.charResults = Array.from(text, (expected) => ({
      expected,
      actual: null,
      correct: null,
    }));
    // 文本以换行开头时直接自动消耗
    this.autoAdvancePastNewlines();
    this.emitProgress();
  }

  /** 处理来自 TypingEngine 的标准化输入事件 */
  handleInput(event: TypingEvent): void {
    if (event.type === 'backspace') {
      this.handleBackspace();
      return;
    }

    if (event.type !== 'char' || !event.char) {
      // submit / escape 与逐字练习无关，空字符忽略
      return;
    }

    if (this.userInput.length >= this.targetText.length) {
      // 已完成，忽略额外输入
      return;
    }

    // 回退后可能停在换行符上，输入前先自动消耗
    this.autoAdvancePastNewlines();
    if (this.userInput.length >= this.targetText.length) {
      // 消耗换行后已到达末尾（剩余全为换行），直接判定完成
      this.emitProgress();
      this.onCompleteCb?.(this.getProgress());
      return;
    }

    const index = this.userInput.length;
    const expected = this.targetText[index];
    const actual = event.char;
    this.userInput += actual;

    const result: CharResult = {
      expected,
      actual,
      correct: actual === expected,
      timestamp: Date.now(),
    };
    this.charResults[index] = result;

    if (result.correct === false) {
      this.onMistakeCb?.(result);
    }

    // 行尾字符输入后自动消耗换行符，光标直接跳到下一行开头
    this.autoAdvancePastNewlines();
    this.emitProgress();

    if (this.userInput.length === this.targetText.length) {
      this.onCompleteCb?.(this.getProgress());
    }
  }

  /** 重置所有练习状态 */
  reset(): void {
    this.targetText = '';
    this.userInput = '';
    this.startTime = null;
    this.charResults = [];
  }

  // ------------------------------------------------------------------
  // 统计与查询
  // ------------------------------------------------------------------

  /** 获取当前进度统计（换行符自动跳过，不计入统计） */
  getProgress(): TrainProgress {
    const total = countTypedChars(this.targetText);
    const completed = countTypedChars(this.userInput);
    const correct = this.charResults.filter(
      (r) => r.correct === true && r.expected !== '\n'
    ).length;

    const elapsedMinutes =
      this.startTime !== null ? (Date.now() - this.startTime) / MS_PER_MINUTE : 0;
    const wpm = elapsedMinutes > 0 ? correct / CHARS_PER_WORD / elapsedMinutes : 0;
    const cpm = elapsedMinutes > 0 ? completed / elapsedMinutes : 0;

    const errors = this.charResults.filter((r) => r.correct === false);

    return { total, completed, correct, wpm, cpm, errors };
  }

  /** 获取当前目标文本 */
  getTargetText(): string {
    return this.targetText;
  }

  /** 获取用户已输入内容 */
  getUserInput(): string {
    return this.userInput;
  }

  /** 获取逐字符比对结果（副本，外部修改不影响内部状态） */
  getCharResults(): CharResult[] {
    return this.charResults.slice();
  }

  /** 是否已完成全部输入 */
  isComplete(): boolean {
    return this.userInput.length >= this.targetText.length;
  }

  /** 获取下一个待输入字符（已完成时为 null；换行符自动跳过，返回其后的真实字符） */
  getNextChar(): string | null {
    let index = this.userInput.length;
    while (index < this.targetText.length && this.targetText[index] === '\n') {
      index++;
    }
    if (index >= this.targetText.length) {
      return null;
    }
    return this.targetText[index];
  }

  // ------------------------------------------------------------------
  // 内部方法
  // ------------------------------------------------------------------

  /** 回退最后一个输入字符并重置该位置的比对结果（自动跳过的换行符一并回退） */
  private handleBackspace(): void {
    if (this.userInput.length === 0) {
      return;
    }
    this.userInput = this.userInput.slice(0, -1);
    let index = this.userInput.length;
    // 若回退到自动消耗的换行符，继续回退直到上一个真实输入字符
    while (index > 0 && this.targetText[index - 1] === '\n') {
      this.userInput = this.userInput.slice(0, -1);
      index = this.userInput.length;
    }
    this.charResults[index] = {
      expected: this.charResults[index]?.expected ?? '',
      actual: null,
      correct: null,
    };
    // 清理更远处可能残留的旧结果（如跨换行回退或连续回退前的输入）
    for (let i = index + 1; i < this.charResults.length; i++) {
      if (this.charResults[i].actual === null) {
        break;
      }
      this.charResults[i] = {
        expected: this.charResults[i].expected,
        actual: null,
        correct: null,
      };
    }
    this.emitProgress();
  }

  /**
   * 自动跳过换行符：当前位置为 \n 时将其标记为已完成并继续推进，
   * 直到下一个待输入字符不是换行符（连续换行一并跳过）。
   * 用户无需按 Enter，换行仅作为视觉结构保留。
   */
  private autoAdvancePastNewlines(): void {
    while (
      this.userInput.length < this.targetText.length &&
      this.targetText[this.userInput.length] === '\n'
    ) {
      const index = this.userInput.length;
      this.charResults[index] = {
        expected: '\n',
        actual: '\n',
        correct: true,
        timestamp: Date.now(),
      };
      this.userInput += '\n';
    }
  }

  private emitProgress(): void {
    this.onProgressCb?.(this.getProgress());
  }
}

/** 汇总所有层级的键位并去重（用于全键盘混合层级） */
function allLevelKeys(): string[] {
  const keys = new Set<string>();
  for (const level of TRAINING_LEVELS) {
    for (const key of level.keys) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** 返回 [min, max] 区间内的随机整数（闭区间） */
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 统计需要用户实际输入的字符数（排除自动跳过的换行符） */
function countTypedChars(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch !== '\n') {
      count++;
    }
  }
  return count;
}
