import { GameEngine, lengthSpeedFactor } from './game-engine.js';
import type { GameState } from './types.js';

const VOCABULARY = [
  'apple',
  'banana',
  'grape',
  'lemon',
  'peach',
  'tiger',
  'rabbit',
  'eagle',
  'dolphin',
  'penguin',
  'happy',
  'bright',
  'strong',
  'gentle',
  'clever',
  'planet',
  'rocket',
  'galaxy',
  'comet',
  'nebula',
  'function',
  'variable',
  'array',
  'object',
  'return',
];

/** 初始/上限生命：提高容错，避免过早失败打击积极性 */
const START_LIVES = 5;
const MAX_LIVES = 5;
/** 每关需销毁的单词数（通关目标），达成即升关 */
const LEVEL_CLEAR_WORDS = 10;
/** 累计通关多少关后判定「通关成功」（胜利） */
const LEVELS_TO_WIN = 10;
/** 下落速度饱和曲线参数：base + gain*(1 - e^{-level/k})，斜率随等级递减、整体平缓 */
const FALL_BASE = 0.7;
const FALL_GAIN = 1.8;
const FALL_SATUR_K = 8;
const FALL_JITTER = 0.4;
/** 出词间隔线性递减参数与下限（下限抬高，避免后期过于密集） */
const SPAWN_BASE = 2400;
const SPAWN_PER_LEVEL = 70;
const SPAWN_FLOOR = 1400;

/** 游戏难度与词源选项（均可选，缺省为原始行为） */
export interface GameOptions {
  /** 起始等级（>=1），决定初始下落速度与生成间隔；升级仍按分数递增 */
  startingLevel?: number;
  /** 速度倍率，乘在基础下落速度上（0.5x~2x） */
  speedMultiplier?: number;
  /** 词源提供者：返回一个单词文本；缺省或返回空时用内置词表随机 */
  wordProvider?: () => string;
  /** 音效钩子：由外层（main.ts）接到 SoundManager，缺省无声 */
  onSfx?: (name: FallingSfx) => void;
}

/** 单词掉落的音效事件名（GameSfx 的子集） */
export type FallingSfx = 'key' | 'error' | 'destroy' | 'levelup' | 'hurt' | 'gameover';

/**
 * 下落速度公式（抽为纯函数便于测试）。
 * 采用饱和曲线 base + gain*(1 - e^{-level/k})：低等级斜率本就小、随等级递增斜率进一步递减，
 * 使各关之间难度斜率平缓且有上限，避免线性无限加速导致劝退。
 * @param level 当前等级
 * @param speedMultiplier 速度倍率
 * @param random [0,1) 随机因子（由调用方传入 Math.random()）
 */
export function computeFallSpeed(level: number, speedMultiplier: number, random: number): number {
  const saturated = FALL_BASE + FALL_GAIN * (1 - Math.exp(-level / FALL_SATUR_K));
  return (saturated + random * FALL_JITTER) * speedMultiplier;
}

/** 生成间隔公式（抽为纯函数）：等级越高间隔越短，递减更缓且下限抬高到 1400ms */
export function computeSpawnInterval(level: number): number {
  return Math.max(SPAWN_FLOOR, SPAWN_BASE - level * SPAWN_PER_LEVEL);
}

/**
 * 单词掉落游戏。
 * 循环 / 状态 / 暂停恢复 / 输入门控 / TypingEngine 接入等通用能力由 GameEngine 基类提供，
 * 本类只保留下落玩法：自动锁定、逐字符击落、通关升关与 Canvas 绘制。
 */
export class FallingWordGame extends GameEngine<GameState> {
  private wordProvider?: () => string;
  private lastSpawn = 0;
  private sfx?: (name: FallingSfx) => void;

  constructor(
    canvasId: string,
    onUpdate: (state: GameState) => void,
    onGameOver: (score: number) => void,
    options: GameOptions = {}
  ) {
    super(canvasId, { onUpdate, onGameOver }, options);
    this.wordProvider = options.wordProvider;
    this.sfx = options.onSfx;
  }

  /**
   * 应用新的难度/词源选项并重置游戏（设置变更时调用）。
   * 视为“全量替换”：调用方（main.ts）总是传入由完整设置派生的选项，
   * 因此 wordProvider 为 undefined 时即表示回退到内置词表。
   */
  applyOptions(options: GameOptions): void {
    this.startingLevel = Math.max(1, options.startingLevel ?? 1);
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.wordProvider = options.wordProvider;
    this.sfx = options.onSfx;
    this.reset();
  }

  protected createState(): GameState {
    return {
      ...this.createBaseState(),
      lives: START_LIVES,
      words: [],
      currentInput: '',
      lockedWordIndex: null,
      wordsClearedThisLevel: 0,
      levelsCleared: 0,
      victory: false,
    };
  }

  /** 倒计时结束 / 恢复运行时重置出词计时，避免立即补刷单词 */
  protected onResume(): void {
    this.lastSpawn = performance.now();
  }

  /** 锁定单词的下一个期望字符（供外层判定空格是字符还是提交） */
  expectedChar(): string | null {
    if (!this.acceptsInput() || this.state.lockedWordIndex === null) return null;
    const word = this.state.words[this.state.lockedWordIndex];
    return word ? (word.text[word.typedIndex]?.toLowerCase() ?? null) : null;
  }

  protected onChar(char: string): void {
    // 自动锁定：优先匹配位置最低（最紧急）且以当前字符开头的单词
    if (this.state.lockedWordIndex === null) {
      const matchIndex = this.findMatchingWord(char);
      if (matchIndex !== null) {
        this.state.lockedWordIndex = matchIndex;
      } else {
        this.recordError(char);
        this.sfx?.('error');
        this.emitUpdate();
        return;
      }
    }

    const word = this.state.words[this.state.lockedWordIndex];
    if (!word) return;

    const expected = word.text[word.typedIndex].toLowerCase();
    if (char === expected) {
      word.typedIndex += 1;
      this.state.currentInput += char;
      this.sfx?.('key');

      if (word.typedIndex >= word.text.length) {
        this.destroyWord(this.state.lockedWordIndex);
      } else {
        this.emitUpdate();
      }
    } else {
      this.recordError(char);
      this.sfx?.('error');
      this.emitUpdate();
    }
  }

  protected onBackspace(): void {
    if (this.state.lockedWordIndex === null) return;

    const word = this.state.words[this.state.lockedWordIndex];
    if (!word || word.typedIndex === 0) return;

    word.typedIndex -= 1;
    this.state.currentInput = this.state.currentInput.slice(0, -1);
    this.emitUpdate();
  }

  protected onSubmit(): void {
    // 当前设计为逐字符输入即销毁，submit 用于清理输入框显示
    this.state.currentInput = '';
    this.emitUpdate();
  }

  /** 结算音效（胜/负都走基类 gameOver） */
  protected gameOver(): void {
    this.sfx?.('gameover');
    super.gameOver();
  }

  private findMatchingWord(char: string): number | null {
    // 优先匹配位置最低（最靠近底部、最紧急）且以该字符开头的单词
    let bestIndex: number | null = null;
    let bestY = -Infinity;
    for (let i = 0; i < this.state.words.length; i++) {
      const word = this.state.words[i];
      if (word.text[word.typedIndex].toLowerCase() === char && word.y > bestY) {
        bestY = word.y;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private destroyWord(index: number): void {
    const word = this.state.words[index];
    if (!word) return;

    const baseScore = word.text.length * 10;
    const levelBonus = this.state.level * 5;
    this.state.score += baseScore + levelBonus;
    this.sfx?.('destroy');

    this.state.words.splice(index, 1);
    this.state.lockedWordIndex = null;
    this.state.currentInput = '';

    // 累计本关进度；达成通关目标即升关（平缓斜率 + 允许通关），否则仅刷新状态
    this.state.wordsClearedThisLevel = (this.state.wordsClearedThisLevel ?? 0) + 1;
    if (this.state.wordsClearedThisLevel >= LEVEL_CLEAR_WORDS) {
      this.handleLevelClear();
    } else {
      this.emitUpdate();
    }
  }

  /** 通关当前关：升关、回补生命、记录通关数并闪横幅；达到总关数则判定通关成功 */
  private handleLevelClear(): void {
    this.state.levelsCleared = (this.state.levelsCleared ?? 0) + 1;
    this.state.level += 1;
    this.state.wordsClearedThisLevel = 0;
    this.state.lives = Math.min(this.state.lives + 1, MAX_LIVES);
    this.state.levelClearFlashAt = performance.now();
    this.sfx?.('levelup');

    if ((this.state.levelsCleared ?? 0) >= LEVELS_TO_WIN) {
      this.state.victory = true;
      this.gameOver();
      return;
    }
    this.emitUpdate();
  }

  private spawnWord(): void {
    const provided = this.wordProvider?.();
    const text =
      provided && provided.length > 0
        ? provided
        : VOCABULARY[Math.floor(Math.random() * VOCABULARY.length)];
    const padding = 60;
    const x = padding + Math.random() * (this.canvas.width - padding * 2);
    // 长文本（词库短语/句子）按长度减速，保证有足够输入时间
    const speed =
      computeFallSpeed(this.state.level, this.speedMultiplier, Math.random()) *
      lengthSpeedFactor(text);
    this.state.words.push({ text, x, y: 0, speed, typedIndex: 0 });
  }

  protected update(now: number): void {
    const spawnInterval = computeSpawnInterval(this.state.level);
    if (now - this.lastSpawn > spawnInterval) {
      this.spawnWord();
      this.lastSpawn = now;
    }

    for (let i = this.state.words.length - 1; i >= 0; i--) {
      const word = this.state.words[i];
      word.y += word.speed;

      if (word.y > this.canvas.height - 20) {
        this.state.words.splice(i, 1);
        if (this.state.lockedWordIndex === i) {
          this.state.lockedWordIndex = null;
          this.state.currentInput = '';
        } else if (this.state.lockedWordIndex !== null && this.state.lockedWordIndex > i) {
          this.state.lockedWordIndex -= 1;
        }

        this.state.lives -= 1;
        this.sfx?.('hurt');
        if (this.state.lives <= 0) {
          this.gameOver();
          return;
        }
        this.emitUpdate();
      }
    }
  }

  protected draw(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 错误反馈窗口：lastError 发生后 ~300ms 内做红色闪烁 + shake，超时自动恢复正常渲染
    const now = performance.now();
    const lastError = this.state.lastError;
    const errorActive = lastError !== undefined && now - lastError.at < 300;
    // 错误后的衰减进度（0→1），用于 shake 幅度与闪烁淡出
    const errorT = errorActive && lastError ? (now - lastError.at) / 300 : 1;

    ctx.clearRect(0, 0, width, height);

    // 背景网格
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // 危险线（无锁定单词时，错误在此区域红色闪烁）
    const dangerFlash = errorActive && this.state.lockedWordIndex === null;
    ctx.save();
    ctx.strokeStyle = dangerFlash ? '#ff1f4b' : '#f43f5e';
    ctx.lineWidth = dangerFlash ? 4 : 1;
    if (dangerFlash) {
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 16;
    }
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, height - 30);
    ctx.lineTo(width, height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 单词
    for (let i = 0; i < this.state.words.length; i++) {
      const word = this.state.words[i];
      const isLocked = i === this.state.lockedWordIndex;
      // 错误时锁定单词做衰减 shake 偏移
      const errorLocked = errorActive && isLocked;
      const shakeX = errorLocked ? Math.sin(errorT * Math.PI * 4) * 5 * (1 - errorT) : 0;
      const drawX = word.x + shakeX;

      ctx.font = isLocked ? 'bold 26px sans-serif' : '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(word.text, drawX + 2, word.y + 2);

      // 已输入部分高亮（错误时锁定单词整体染红，强调“这个单词敲错了”）
      const typed = word.text.slice(0, word.typedIndex);
      const untyped = word.text.slice(word.typedIndex);
      const fullWidth = ctx.measureText(word.text).width;
      const typedWidth = ctx.measureText(typed).width;
      const startX = drawX - fullWidth / 2;

      ctx.fillStyle = errorLocked ? '#f43f5e' : isLocked ? '#22c55e' : '#38bdf8';
      ctx.fillText(typed, startX + typedWidth / 2, word.y);

      ctx.fillStyle = errorLocked ? '#fca5a5' : isLocked ? '#fbbf24' : '#f8fafc';
      ctx.fillText(untyped, startX + typedWidth + ctx.measureText(untyped).width / 2, word.y);

      // 锁定框
      if (isLocked) {
        ctx.strokeStyle = errorLocked ? '#f43f5e' : '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX - fullWidth / 2 - 8, word.y - 18, fullWidth + 16, 36);
      }

      // 错误字符标注：在锁定单词上方绘制 ✗ <错误字符>
      if (errorLocked && lastError) {
        ctx.fillStyle = '#f43f5e';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`✗ ${lastError.char}`, drawX, word.y - 34);
      }
    }

    // 无锁定单词时的错误标注：在危险线上方居中绘制 ✗ <错误字符>
    if (errorActive && this.state.lockedWordIndex === null && lastError) {
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✗ ${lastError.char}`, width / 2, height - 60);
    }

    // 倒计时
    if (this.state.isRunning && this.state.countdown > 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(this.state.countdown), width / 2, height / 2);
    }

    // 暂停遮罩
    if (this.state.isPaused) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', width / 2, height / 2);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '20px sans-serif';
      ctx.fillText('按 Ctrl+P 继续', width / 2, height / 2 + 40);
    }

    // 通关横幅：升关后 ~1.2s 内居中提示，强化「过关」正反馈
    const flashAt = this.state.levelClearFlashAt;
    if (this.state.isRunning && flashAt !== undefined && now - flashAt < 1200) {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`第 ${this.state.level - 1} 关 通关！`, width / 2, height / 2 - 60);
    }

    // 通关成功（胜利）遮罩
    if (this.state.victory) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('通关成功！', width / 2, height / 2 - 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '24px sans-serif';
      ctx.fillText(`最终得分: ${this.state.score}`, width / 2, height / 2 + 30);
    }

    if (!this.state.isRunning && this.state.lives <= 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', width / 2, height / 2 - 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '24px sans-serif';
      ctx.fillText(`最终得分: ${this.state.score}`, width / 2, height / 2 + 30);
    }
  }
}
