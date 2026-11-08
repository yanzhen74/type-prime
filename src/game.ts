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

/** 游戏难度与词源选项（均可选，缺省为原始行为） */
export interface GameOptions {
  /** 起始等级（>=1），决定初始下落速度与生成间隔；升级仍按分数递增 */
  startingLevel?: number;
  /** 速度倍率，乘在基础下落速度上（0.5x~2x） */
  speedMultiplier?: number;
  /** 词源提供者：返回一个单词文本；缺省或返回空时用内置词表随机 */
  wordProvider?: () => string;
}

/**
 * 下落速度公式（抽为纯函数便于测试）。
 * @param level 当前等级
 * @param speedMultiplier 速度倍率
 * @param random [0,1) 随机因子（由调用方传入 Math.random()）
 */
export function computeFallSpeed(level: number, speedMultiplier: number, random: number): number {
  return (0.8 + level * 0.25 + random * 0.5) * speedMultiplier;
}

/** 生成间隔公式（抽为纯函数）：等级越高间隔越短，下限 1200ms */
export function computeSpawnInterval(level: number): number {
  return Math.max(1200, 2500 - level * 200);
}

/** 由分数换算等级（抽为纯函数）：每 100 分升一级，以 startingLevel 为基准 */
export function computeLevel(score: number, startingLevel: number): number {
  return Math.floor(score / 100) + startingLevel;
}

export class FallingWordGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private animationId = 0;
  private lastSpawn = 0;
  private countdownTimer = 0;
  private onUpdate: (state: GameState) => void;
  private onGameOver: (score: number) => void;
  // 难度与词源选项
  private startingLevel: number;
  private speedMultiplier: number;
  private wordProvider?: () => string;

  constructor(
    canvasId: string,
    onUpdate: (state: GameState) => void,
    onGameOver: (score: number) => void,
    options: GameOptions = {}
  ) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Game canvas not found');
    }
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = ctx;
    this.onUpdate = onUpdate;
    this.onGameOver = onGameOver;
    this.startingLevel = Math.max(1, options.startingLevel ?? 1);
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.wordProvider = options.wordProvider;
    this.state = this.createInitialState();
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
    this.reset();
  }

  private createInitialState(): GameState {
    return {
      score: 0,
      lives: 3,
      level: this.startingLevel,
      isRunning: false,
      isPaused: false,
      words: [],
      currentInput: '',
      lockedWordIndex: null,
      mistakes: 0,
      countdown: 3,
    };
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state = this.createInitialState();
    this.state.isRunning = true;
    this.state.countdown = 3;
    this.runCountdown();
    this.onUpdate(this.state);
  }

  /** 游戏是否正在运行（含倒计时和暂停状态） */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  private runCountdown(): void {
    if (this.state.countdown > 0) {
      this.draw();
      this.countdownTimer = window.setTimeout(() => {
        this.state.countdown -= 1;
        this.onUpdate(this.state);
        this.runCountdown();
      }, 1000);
    } else {
      this.lastSpawn = performance.now();
      this.loop(performance.now());
    }
  }

  pause(): void {
    this.state.isPaused = !this.state.isPaused;
    if (!this.state.isPaused) {
      this.lastSpawn = performance.now();
      this.loop(performance.now());
    } else {
      cancelAnimationFrame(this.animationId);
      this.draw();
    }
    this.onUpdate(this.state);
  }

  reset(): void {
    this.state.isRunning = false;
    cancelAnimationFrame(this.animationId);
    window.clearTimeout(this.countdownTimer);
    this.state = this.createInitialState();
    this.draw();
    this.onUpdate(this.state);
  }

  handleInput(char: string): void {
    if (!this.state.isRunning || this.state.isPaused || this.state.countdown > 0) return;

    // 自动锁定：优先匹配位置最低（最紧急）且以当前字符开头的单词
    if (this.state.lockedWordIndex === null) {
      const matchIndex = this.findMatchingWord(char);
      if (matchIndex !== null) {
        this.state.lockedWordIndex = matchIndex;
      } else {
        this.recordError(char);
        this.onUpdate(this.state);
        return;
      }
    }

    const word = this.state.words[this.state.lockedWordIndex];
    if (!word) return;

    const expected = word.text[word.typedIndex].toLowerCase();
    if (char === expected) {
      word.typedIndex += 1;
      this.state.currentInput += char;

      if (word.typedIndex >= word.text.length) {
        this.destroyWord(this.state.lockedWordIndex);
      } else {
        this.onUpdate(this.state);
      }
    } else {
      this.recordError(char);
      this.onUpdate(this.state);
    }
  }

  /** 记录一次错误输入：累加失误并写入 lastError（字符 + 时间戳），供 draw() 做短时红色闪烁反馈 */
  private recordError(char: string): void {
    this.state.mistakes += 1;
    this.state.lastError = { char, at: performance.now() };
  }

  handleBackspace(): void {
    if (!this.state.isRunning || this.state.isPaused || this.state.countdown > 0) return;
    if (this.state.lockedWordIndex === null) return;

    const word = this.state.words[this.state.lockedWordIndex];
    if (!word || word.typedIndex === 0) return;

    word.typedIndex -= 1;
    this.state.currentInput = this.state.currentInput.slice(0, -1);
    this.onUpdate(this.state);
  }

  submitWord(): void {
    if (!this.state.isRunning || this.state.isPaused || this.state.countdown > 0) return;
    // 当前设计为逐字符输入即销毁，submit 用于清理输入框显示
    this.state.currentInput = '';
    this.onUpdate(this.state);
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

    this.state.words.splice(index, 1);
    this.state.lockedWordIndex = null;
    this.state.currentInput = '';

    // 每 100 分升一级（以起始等级为基准）
    const newLevel = computeLevel(this.state.score, this.startingLevel);
    if (newLevel > this.state.level) {
      this.state.level = newLevel;
    }

    this.onUpdate(this.state);
  }

  private spawnWord(): void {
    const provided = this.wordProvider?.();
    const text =
      provided && provided.length > 0
        ? provided
        : VOCABULARY[Math.floor(Math.random() * VOCABULARY.length)];
    const padding = 60;
    const x = padding + Math.random() * (this.canvas.width - padding * 2);
    const speed = computeFallSpeed(this.state.level, this.speedMultiplier, Math.random());
    this.state.words.push({ text, x, y: 0, speed, typedIndex: 0 });
  }

  private loop(now: number): void {
    if (!this.state.isRunning || this.state.isPaused || this.state.countdown > 0) return;

    const spawnInterval = computeSpawnInterval(this.state.level);
    if (now - this.lastSpawn > spawnInterval) {
      this.spawnWord();
      this.lastSpawn = now;
    }

    this.update();
    this.draw();

    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }

  private update(): void {
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
        if (this.state.lives <= 0) {
          this.gameOver();
          return;
        }
        this.onUpdate(this.state);
      }
    }
  }

  private gameOver(): void {
    this.state.isRunning = false;
    cancelAnimationFrame(this.animationId);
    this.onGameOver(this.state.score);
    this.onUpdate(this.state);
  }

  private draw(): void {
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
