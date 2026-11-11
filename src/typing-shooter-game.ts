import { GameEngine, lengthSpeedFactor, type GameEngineOptions } from './game-engine.js';
import type { ShooterKind, ShooterState } from './types.js';

/** 每关需击毁的目标数（通关目标） */
const TARGETS_PER_LEVEL = 8;
/** 累计通关多少关后判定「通关成功」 */
const LEVELS_TO_WIN = 8;
/** 每隔多少关出现一次 BOSS */
const BOSS_EVERY = 4;
const START_LIVES = 5;
const MAX_LIVES = 5;
/** 下落速度饱和曲线参数（与单词掉落同族，斜率递减、有上限） */
const FALL_BASE = 0.6;
const FALL_GAIN = 1.4;
const FALL_SATUR_K = 8;
const FALL_JITTER = 0.3;
/** 出词间隔线性递减参数与下限 */
const SPAWN_BASE = 2200;
const SPAWN_PER_LEVEL = 60;
const SPAWN_FLOOR = 1200;
/** 击毁特效存活时长（ms） */
const EFFECT_TTL = 400;

/** 各类型内容池：关卡由浅入深依次启用 */
export const SHOOTER_CONTENT: Record<Exclude<ShooterKind, 'boss'>, string[]> = {
  letter: ['a', 's', 'd', 'f', 'j', 'k', 'l', 'g', 'h'],
  combo: ['as', 'df', 'jk', 'li', 'th', 'er', 'in', 'on', 'st', 'ar'],
  simple: ['cat', 'dog', 'sun', 'run', 'key', 'map', 'pen', 'box', 'cup', 'hat'],
  complex: ['function', 'variable', 'keyboard', 'monitor', 'network', 'compiler', 'database'],
  phrase: ['type fast', 'keep going', 'well done', 'good job', 'nice shot', 'level up'],
};

/** BOSS 携带的长句（需多轮输入） */
export const BOSS_CONTENT = [
  'the quick brown fox jumps',
  'pack my box with five jugs',
  'how vexingly quick daft zebras',
];

/**
 * 关卡 → 内容类型映射（抽为纯函数便于测试）。
 * 1 单字母 → 2 字母组合 → 3~4 简单单词 → 5~6 复杂单词 → 7+ 短语；
 * BOSS 不由关卡直接映射，而在 BOSS 关作为该关最后一个目标出现。
 */
export function contentKindForLevel(level: number): Exclude<ShooterKind, 'boss'> {
  if (level <= 1) return 'letter';
  if (level === 2) return 'combo';
  if (level <= 4) return 'simple';
  if (level <= 6) return 'complex';
  return 'phrase';
}

/** 下落速度公式（饱和曲线，纯函数） */
export function computeShooterFallSpeed(level: number, multiplier: number, random: number): number {
  const saturated = FALL_BASE + FALL_GAIN * (1 - Math.exp(-level / FALL_SATUR_K));
  return (saturated + random * FALL_JITTER) * multiplier;
}

/** 出词间隔公式（纯函数） */
export function computeShooterSpawnInterval(level: number): number {
  return Math.max(SPAWN_FLOOR, SPAWN_BASE - level * SPAWN_PER_LEVEL);
}

/** 闯关射击选项：在通用选项之上允许注入确定性随机源（供测试） */
export interface ShooterOptions extends GameEngineOptions {
  rng?: () => number;
}

/**
 * 闯关射击游戏（块三游戏任务 2）。
 *
 * 目标从单字母起步，逐关过渡到字母组合、简单单词、复杂单词、短语；
 * 输入正确即发射击毁目标，含连击加成、关卡推进、BOSS 战与结算页。
 * 循环 / 状态 / 暂停恢复 / 输入门控复用 GameEngine 基类。
 */
export class TypingShooterGame extends GameEngine<ShooterState> {
  private readonly rng: () => number;
  private lastSpawn = 0;
  private nextId = 1;

  constructor(
    canvasId: string,
    onUpdate: (state: ShooterState) => void,
    onGameOver: (score: number) => void,
    options: ShooterOptions = {}
  ) {
    super(canvasId, { onUpdate, onGameOver }, options);
    this.rng = options.rng ?? Math.random;
  }

  protected createState(): ShooterState {
    return {
      ...this.createBaseState(),
      lives: START_LIVES,
      targets: [],
      lockedTargetIndex: null,
      currentInput: '',
      combo: 0,
      maxCombo: 0,
      correctChars: 0,
      targetsClearedThisLevel: 0,
      levelsCleared: 0,
      victory: false,
      effects: [],
    };
  }

  protected onResume(): void {
    this.lastSpawn = performance.now();
  }

  /** 锁定目标的下一个期望字符（供外层判定空格是字符还是提交） */
  expectedChar(): string | null {
    if (!this.acceptsInput() || this.state.lockedTargetIndex === null) return null;
    const target = this.state.targets[this.state.lockedTargetIndex];
    return target ? (target.text[target.typedIndex]?.toLowerCase() ?? null) : null;
  }

  protected onChar(char: string): void {
    // 自动锁定：优先匹配位置最低（最紧急）且下一字符相符的目标
    if (this.state.lockedTargetIndex === null) {
      const matchIndex = this.findMatchingTarget(char);
      if (matchIndex === null) {
        this.registerMiss(char);
        return;
      }
      this.state.lockedTargetIndex = matchIndex;
    }

    const target = this.state.targets[this.state.lockedTargetIndex];
    if (!target) return;

    const expected = target.text[target.typedIndex].toLowerCase();
    if (char === expected) {
      target.typedIndex += 1;
      this.state.currentInput += char;
      this.state.correctChars += 1;
      if (target.typedIndex >= target.text.length) {
        this.hitTarget(this.state.lockedTargetIndex);
      } else {
        this.emitUpdate();
      }
    } else {
      this.registerMiss(char);
    }
  }

  protected onBackspace(): void {
    if (this.state.lockedTargetIndex === null) return;
    const target = this.state.targets[this.state.lockedTargetIndex];
    if (!target || target.typedIndex === 0) return;
    target.typedIndex -= 1;
    this.state.currentInput = this.state.currentInput.slice(0, -1);
    this.emitUpdate();
  }

  protected onSubmit(): void {
    this.state.currentInput = '';
    this.emitUpdate();
  }

  /** 记录一次失误：错误计数 + 闪烁反馈 + 连击清零 */
  private registerMiss(char: string): void {
    this.recordError(char);
    this.state.combo = 0;
    this.emitUpdate();
  }

  private findMatchingTarget(char: string): number | null {
    let bestIndex: number | null = null;
    let bestY = -Infinity;
    for (let i = 0; i < this.state.targets.length; i++) {
      const t = this.state.targets[i];
      if (t.text[t.typedIndex].toLowerCase() === char && t.y > bestY) {
        bestY = t.y;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  /** 目标被完整输入一轮：BOSS 扣血并重置输入，普通目标直接击毁 */
  private hitTarget(index: number): void {
    const target = this.state.targets[index];
    if (!target) return;

    target.hp -= 1;
    if (target.hp > 0) {
      target.typedIndex = 0;
      this.state.currentInput = '';
      this.state.score += 5;
      this.emitUpdate();
      return;
    }

    // 连击加成：当前连击越高倍率越高（封顶 10 连）
    const multiplier = 1 + Math.min(this.state.combo, 10) * 0.1;
    this.state.score += Math.round(target.text.length * 10 * multiplier) + this.state.level * 5;
    this.state.combo += 1;
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
    this.state.effects.push({ x: target.x, y: target.y, at: performance.now() });

    this.state.targets.splice(index, 1);
    this.state.lockedTargetIndex = null;
    this.state.currentInput = '';

    this.state.targetsClearedThisLevel += 1;
    if (this.state.targetsClearedThisLevel >= TARGETS_PER_LEVEL) {
      this.handleLevelClear();
    } else {
      this.emitUpdate();
    }
  }

  private handleLevelClear(): void {
    this.state.levelsCleared += 1;
    this.state.level += 1;
    this.state.targetsClearedThisLevel = 0;
    this.state.lives = Math.min(this.state.lives + 1, MAX_LIVES);
    this.state.levelClearFlashAt = performance.now();

    if (this.state.levelsCleared >= LEVELS_TO_WIN) {
      this.state.victory = true;
      this.gameOver();
      return;
    }
    this.emitUpdate();
  }

  /** 选择本个目标的内容类型：BOSS 关的最后一个目标为 BOSS */
  private chooseKind(): ShooterKind {
    const isBossLevel = this.state.level % BOSS_EVERY === 0;
    const isLastTargetOfLevel = this.state.targetsClearedThisLevel === TARGETS_PER_LEVEL - 1;
    const bossAlive = this.state.targets.some((t) => t.kind === 'boss');
    if (isBossLevel && isLastTargetOfLevel && !bossAlive) return 'boss';
    return contentKindForLevel(this.state.level);
  }

  protected spawnTarget(): void {
    const kind = this.chooseKind();
    const pool = kind === 'boss' ? BOSS_CONTENT : SHOOTER_CONTENT[kind];
    const text = pool[Math.floor(this.rng() * pool.length)];
    const padding = 60;
    const x = padding + this.rng() * (this.canvas.width - padding * 2);
    // 短语/BOSS 长句按长度减速，保证有足够输入时间
    const speed =
      computeShooterFallSpeed(this.state.level, this.speedMultiplier, this.rng()) *
      lengthSpeedFactor(text);
    this.state.targets.push({
      id: this.nextId++,
      text,
      kind,
      typedIndex: 0,
      x,
      y: 0,
      speed,
      hp: kind === 'boss' ? 3 : 1,
    });
  }

  protected update(now: number): void {
    const interval = computeShooterSpawnInterval(this.state.level);
    if (now - this.lastSpawn > interval) {
      this.spawnTarget();
      this.lastSpawn = now;
    }

    // 清理过期特效
    this.state.effects = this.state.effects.filter((e) => now - e.at < EFFECT_TTL);

    for (let i = this.state.targets.length - 1; i >= 0; i--) {
      const t = this.state.targets[i];
      t.y += t.speed;

      if (t.y > this.canvas.height - 20) {
        this.state.targets.splice(i, 1);
        if (this.state.lockedTargetIndex === i) {
          this.state.lockedTargetIndex = null;
          this.state.currentInput = '';
        } else if (this.state.lockedTargetIndex !== null && this.state.lockedTargetIndex > i) {
          this.state.lockedTargetIndex -= 1;
        }

        this.state.combo = 0;
        this.state.lives -= 1;
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
    const now = performance.now();
    const lastError = this.state.lastError;
    const errorActive = lastError !== undefined && now - lastError.at < 300;

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

    // 连击指示
    if (this.state.combo > 1) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`连击 x${this.state.combo}`, 16, 12);
    }

    // 击毁特效：扩散环
    for (const e of this.state.effects) {
      const t = (now - e.at) / EFFECT_TTL;
      ctx.strokeStyle = `rgba(34, 197, 94, ${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 10 + t * 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 目标
    for (let i = 0; i < this.state.targets.length; i++) {
      const t = this.state.targets[i];
      const isLocked = i === this.state.lockedTargetIndex;
      const isBoss = t.kind === 'boss';
      const errorLocked = errorActive && isLocked;

      ctx.font = isBoss
        ? 'bold 26px sans-serif'
        : isLocked
          ? 'bold 22px sans-serif'
          : '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const fullWidth = ctx.measureText(t.text).width;
      const boxW = fullWidth + 24;
      const boxH = isBoss ? 48 : 36;

      // 机体
      ctx.fillStyle = isBoss ? 'rgba(244,63,94,0.25)' : 'rgba(56,189,248,0.15)';
      ctx.strokeStyle = errorLocked
        ? '#f43f5e'
        : isLocked
          ? '#fbbf24'
          : isBoss
            ? '#f43f5e'
            : '#38bdf8';
      ctx.lineWidth = isLocked || isBoss ? 2 : 1;
      ctx.beginPath();
      ctx.rect(t.x - boxW / 2, t.y - boxH / 2, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      // 文本：已输入部分绿色，未输入部分浅色
      const typed = t.text.slice(0, t.typedIndex);
      const untyped = t.text.slice(t.typedIndex);
      const typedWidth = ctx.measureText(typed).width;
      const startX = t.x - fullWidth / 2;
      ctx.fillStyle = errorLocked ? '#f43f5e' : '#22c55e';
      ctx.fillText(typed, startX + typedWidth / 2, t.y);
      ctx.fillStyle = errorLocked ? '#fca5a5' : '#f8fafc';
      ctx.fillText(untyped, startX + typedWidth + ctx.measureText(untyped).width / 2, t.y);

      // BOSS 血条
      if (isBoss) {
        const hpW = boxW * (t.hp / 3);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(t.x - boxW / 2, t.y - boxH / 2 - 8, hpW, 4);
      }
    }

    // 错误字符标注
    if (errorActive && lastError) {
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✗ ${lastError.char}`, width / 2, height - 40);
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
    }

    // 通关横幅
    const flashAt = this.state.levelClearFlashAt;
    if (this.state.isRunning && flashAt !== undefined && now - flashAt < 1200) {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`第 ${this.state.level - 1} 关 通关！`, width / 2, height / 2 - 60);
    }

    // 结算页（胜利 / 失败）
    if (this.state.victory || (!this.state.isRunning && this.state.lives <= 0)) {
      this.drawSettlement(
        this.state.victory ? '通关成功！' : 'GAME OVER',
        this.state.victory ? '#22c55e' : '#f43f5e'
      );
    }
  }

  /** 结算页：最终得分 / 最高连击 / 准确率 / 通关关数 */
  private drawSettlement(title: string, color: string): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(title, width / 2, height / 2 - 70);

    const total = this.state.correctChars + this.state.mistakes;
    const accuracy = total > 0 ? (this.state.correctChars / total) * 100 : 100;

    ctx.fillStyle = '#f8fafc';
    ctx.font = '24px sans-serif';
    ctx.fillText(`最终得分: ${this.state.score}`, width / 2, height / 2 - 10);
    ctx.fillText(`最高连击: x${this.state.maxCombo}`, width / 2, height / 2 + 25);
    ctx.fillText(`准确率: ${accuracy.toFixed(1)}%`, width / 2, height / 2 + 60);
    ctx.fillText(`通关关数: ${this.state.levelsCleared}`, width / 2, height / 2 + 95);
  }
}
