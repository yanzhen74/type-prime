import { GameEngine, type GameEngineOptions } from './game-engine.js';
import type { Zombie, ZombieKind, ZombieState } from './types.js';

/** 坚守多少波后判定「防守成功」 */
const WAVES_TO_WIN = 8;
/** 基地血量（初始/上限）：僵尸触底扣血，血尽即失守 */
const START_BASE_HP = 10;
const MAX_BASE_HP = 10;
/** 出怪间隔线性递减参数与下限 */
const SPAWN_BASE = 1800;
const SPAWN_PER_WAVE = 60;
const SPAWN_FLOOR = 900;
/** 击杀掉落道具概率 */
const ITEM_CHANCE = 0.25;
/** 冻结道具持续时长（ms） */
const FREEZE_MS = 2000;
/** 击杀/道具提示存活时长（ms） */
const EFFECT_TTL = 800;

/** 各类型僵尸属性：生命 / 触底伤害 / 基础速度 */
export const ZOMBIE_HP: Record<ZombieKind, number> = { normal: 1, fast: 1, tank: 3, boss: 5 };
export const ZOMBIE_DAMAGE: Record<ZombieKind, number> = { normal: 1, fast: 1, tank: 2, boss: 3 };
const ZOMBIE_SPEED: Record<ZombieKind, number> = { normal: 0.5, fast: 0.9, tank: 0.3, boss: 0.25 };

/** 各类型僵尸携带的单词池 */
export const ZOMBIE_WORDS: Record<ZombieKind, string[]> = {
  normal: ['brain', 'plant', 'pea', 'sun', 'lawn', 'seed'],
  fast: ['run', 'zip', 'dash', 'bolt'],
  tank: ['armored', 'bulwark', 'behemoth', 'fortress'],
  boss: ['the plants will defend the lawn', 'zombies beware of the pea shooter'],
};

/** 各类型僵尸造型配色（皮肤 / 衣物） */
const ZOMBIE_PALETTE: Record<ZombieKind, { skin: string; clothes: string }> = {
  normal: { skin: '#a3e635', clothes: '#4d7c0f' },
  fast: { skin: '#fde047', clothes: '#ca8a04' },
  tank: { skin: '#86efac', clothes: '#3f6212' },
  boss: { skin: '#fda4af', clothes: '#7f1d1d' },
};

/** 各类型僵尸造型尺寸（宽/高），快速瘦小、坦克宽壮、BOSS 最大 */
function zombieDims(kind: ZombieKind): { w: number; h: number } {
  switch (kind) {
    case 'fast':
      return { w: 28, h: 44 };
    case 'tank':
      return { w: 46, h: 50 };
    case 'boss':
      return { w: 56, h: 64 };
    default:
      return { w: 34, h: 46 };
  }
}

/** 道具类型：修复基地 / 冻结全场 / 直接加分 */
export type ZombieItem = 'heal' | 'freeze' | 'score';
const ITEMS: ZombieItem[] = ['heal', 'freeze', 'score'];

/**
 * 波次组成（抽为纯函数便于测试）。
 * 每波数量 = min(4+wave, 12)；wave≥2 出现快速、wave≥3 出现坦克、
 * 每 4 波出现 1 只 BOSS；其余为普通僵尸。
 */
export function waveComposition(wave: number): ZombieKind[] {
  const quota = Math.min(4 + wave, 12);
  const boss = wave % 4 === 0 ? 1 : 0;
  const tank = wave >= 3 ? Math.floor(wave / 3) : 0;
  const fast = wave >= 2 ? Math.floor(wave / 2) : 0;
  const normal = Math.max(1, quota - boss - tank - fast);
  const queue: ZombieKind[] = [];
  for (let i = 0; i < normal; i++) queue.push('normal');
  for (let i = 0; i < fast; i++) queue.push('fast');
  for (let i = 0; i < tank; i++) queue.push('tank');
  for (let i = 0; i < boss; i++) queue.push('boss');
  return queue;
}

/** 僵尸移动速度（随波次缓慢提升，纯函数） */
export function computeZombieSpeed(
  kind: ZombieKind,
  wave: number,
  multiplier: number,
  random: number
): number {
  const scale = 1 + Math.min(wave, 10) * 0.06;
  return ZOMBIE_SPEED[kind] * scale * multiplier + random * 0.1;
}

/** 出怪间隔（纯函数） */
export function computeZombieSpawnInterval(wave: number): number {
  return Math.max(SPAWN_FLOOR, SPAWN_BASE - wave * SPAWN_PER_WAVE);
}

/** 僵尸大战选项：通用选项 + 确定性随机源 + 可选词源 */
export interface ZombieOptions extends GameEngineOptions {
  rng?: () => number;
  wordProvider?: () => string;
}

/**
 * 僵尸大战游戏（块三游戏任务 3）。
 *
 * 僵尸挂单词向基地推进，指法输入正确即消灭；波次推进、基地血量、
 * 普通/快速/坦克/BOSS 四类僵尸、击杀掉落道具与结算页。
 * 循环 / 状态 / 暂停恢复 / 输入门控复用 GameEngine 基类，
 * 目标锁定与单词进度逻辑与单词掉落/闯关射击同族。
 */
export class ZombieTypingGame extends GameEngine<ZombieState> {
  private readonly rng: () => number;
  private readonly wordProvider?: () => string;
  private lastSpawn = 0;
  private nextId = 1;

  constructor(
    canvasId: string,
    onUpdate: (state: ZombieState) => void,
    onGameOver: (score: number) => void,
    options: ZombieOptions = {}
  ) {
    super(canvasId, { onUpdate, onGameOver }, options);
    this.rng = options.rng ?? Math.random;
    this.wordProvider = options.wordProvider;
  }

  protected createState(): ZombieState {
    return {
      ...this.createBaseState(),
      lives: START_BASE_HP,
      zombies: [],
      lockedZombieIndex: null,
      currentInput: '',
      waveQueue: waveComposition(this.startingLevel),
      kills: 0,
      items: 0,
      wavesCleared: 0,
      victory: false,
      effects: [],
    };
  }

  protected onResume(): void {
    this.lastSpawn = performance.now();
  }

  protected onChar(char: string): void {
    if (this.state.lockedZombieIndex === null) {
      const match = this.findMatchingZombie(char);
      if (match === null) {
        this.recordError(char);
        this.emitUpdate();
        return;
      }
      this.state.lockedZombieIndex = match;
    }

    const zombie = this.state.zombies[this.state.lockedZombieIndex];
    if (!zombie) return;

    const expected = zombie.text[zombie.typedIndex].toLowerCase();
    if (char === expected) {
      zombie.typedIndex += 1;
      this.state.currentInput += char;
      if (zombie.typedIndex >= zombie.text.length) {
        this.hitZombie(this.state.lockedZombieIndex);
      } else {
        this.emitUpdate();
      }
    } else {
      this.recordError(char);
      this.emitUpdate();
    }
  }

  protected onBackspace(): void {
    if (this.state.lockedZombieIndex === null) return;
    const zombie = this.state.zombies[this.state.lockedZombieIndex];
    if (!zombie || zombie.typedIndex === 0) return;
    zombie.typedIndex -= 1;
    this.state.currentInput = this.state.currentInput.slice(0, -1);
    this.emitUpdate();
  }

  protected onSubmit(): void {
    this.state.currentInput = '';
    this.emitUpdate();
  }

  private findMatchingZombie(char: string): number | null {
    let bestIndex: number | null = null;
    let bestY = -Infinity;
    for (let i = 0; i < this.state.zombies.length; i++) {
      const z = this.state.zombies[i];
      if (z.text[z.typedIndex].toLowerCase() === char && z.y > bestY) {
        bestY = z.y;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  /** 完整输入一轮：扣血，血尽则击杀 */
  private hitZombie(index: number): void {
    const zombie = this.state.zombies[index];
    if (!zombie) return;

    zombie.hp -= 1;
    if (zombie.hp > 0) {
      zombie.typedIndex = 0;
      this.state.currentInput = '';
      this.state.score += 5;
      this.emitUpdate();
      return;
    }

    this.state.score += zombie.text.length * 10 + this.state.level * 5;
    this.state.kills += 1;
    this.state.effects.push({ x: zombie.x, y: zombie.y, at: performance.now(), text: '💥' });
    this.rollItem(zombie.x, zombie.y);

    this.state.zombies.splice(index, 1);
    this.state.lockedZombieIndex = null;
    this.state.currentInput = '';

    if (!this.checkWaveClear()) {
      this.emitUpdate();
    }
  }

  /** 本波清空（击杀或全部触底）则推进波次；返回是否已推进 */
  private checkWaveClear(): boolean {
    if (this.state.waveQueue.length !== 0 || this.state.zombies.length !== 0) return false;
    this.handleWaveClear();
    return true;
  }

  /** 击杀掉落道具：修复 / 冻结 / 加分 */
  private rollItem(x: number, y: number): void {
    if (this.rng() >= ITEM_CHANCE) return;
    const item = ITEMS[Math.floor(this.rng() * ITEMS.length)];
    this.state.items += 1;
    if (item === 'heal') {
      this.state.lives = Math.min(this.state.lives + 1, MAX_BASE_HP);
      this.state.effects.push({ x, y, at: performance.now(), text: '🔧 基地+1' });
    } else if (item === 'freeze') {
      this.state.freezeUntil = performance.now() + FREEZE_MS;
      this.state.effects.push({ x, y, at: performance.now(), text: '❄ 冻结2s' });
    } else {
      this.state.score += 50;
      this.state.effects.push({ x, y, at: performance.now(), text: '+50' });
    }
  }

  private handleWaveClear(): void {
    this.state.wavesCleared += 1;
    if (this.state.wavesCleared >= WAVES_TO_WIN) {
      this.state.victory = true;
      this.gameOver();
      return;
    }
    this.state.level += 1;
    this.state.lives = Math.min(this.state.lives + 1, MAX_BASE_HP);
    this.state.levelClearFlashAt = performance.now();
    this.state.waveQueue = waveComposition(this.state.level);
    this.emitUpdate();
  }

  protected spawnZombie(kind: ZombieKind): void {
    const provided = kind === 'boss' ? undefined : this.wordProvider?.();
    const pool = ZOMBIE_WORDS[kind];
    const text =
      provided && provided.length > 0 ? provided : pool[Math.floor(this.rng() * pool.length)];
    const padding = 60;
    const x = padding + this.rng() * (this.canvas.width - padding * 2);
    const speed = computeZombieSpeed(kind, this.state.level, this.speedMultiplier, this.rng());
    this.state.zombies.push({
      id: this.nextId++,
      text,
      kind,
      typedIndex: 0,
      x,
      y: 0,
      speed,
      hp: ZOMBIE_HP[kind],
      maxHp: ZOMBIE_HP[kind],
    });
  }

  protected update(now: number): void {
    const frozen = this.state.freezeUntil !== undefined && now < this.state.freezeUntil;

    if (
      this.state.waveQueue.length > 0 &&
      now - this.lastSpawn > computeZombieSpawnInterval(this.state.level)
    ) {
      const kind = this.state.waveQueue.shift();
      if (kind) this.spawnZombie(kind);
      this.lastSpawn = now;
    }

    this.state.effects = this.state.effects.filter((e) => now - e.at < EFFECT_TTL);
    if (frozen) return;

    for (let i = this.state.zombies.length - 1; i >= 0; i--) {
      const z = this.state.zombies[i];
      z.y += z.speed;

      if (z.y > this.canvas.height - 30) {
        this.state.zombies.splice(i, 1);
        if (this.state.lockedZombieIndex === i) {
          this.state.lockedZombieIndex = null;
          this.state.currentInput = '';
        } else if (this.state.lockedZombieIndex !== null && this.state.lockedZombieIndex > i) {
          this.state.lockedZombieIndex -= 1;
        }

        this.state.lives -= ZOMBIE_DAMAGE[z.kind];
        if (this.state.lives <= 0) {
          this.gameOver();
          return;
        }
        this.emitUpdate();
      }
    }

    // 本波僵尸全部触底（未被击杀）也须推进波次，否则会卡住不再出怪
    this.checkWaveClear();
  }

  protected draw(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const now = performance.now();
    const frozen = this.state.freezeUntil !== undefined && now < this.state.freezeUntil;
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

    // 基地线
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, height - 30);
    ctx.lineTo(width, height - 30);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`基地血量: ${this.state.lives}`, 12, height - 36);

    // 浮动提示
    for (const e of this.state.effects) {
      const t = (now - e.at) / EFFECT_TTL;
      ctx.fillStyle = `rgba(248, 250, 252, ${1 - t})`;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, e.x, e.y - t * 30);
    }

    // 僵尸
    for (let i = 0; i < this.state.zombies.length; i++) {
      const z = this.state.zombies[i];
      const isLocked = i === this.state.lockedZombieIndex;
      const errorLocked = errorActive && isLocked;
      const { w: bodyW, h: bodyH } = zombieDims(z.kind);

      // 造型躯体（头/躯干/手臂/腿 + 步态摆动；冻结时染蓝）
      this.drawZombieBody(z, now, isLocked, errorLocked, frozen);

      // 携带单词
      ctx.font = isLocked ? 'bold 18px sans-serif' : '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const typed = z.text.slice(0, z.typedIndex);
      const untyped = z.text.slice(z.typedIndex);
      const fullWidth = ctx.measureText(z.text).width;
      const typedWidth = ctx.measureText(typed).width;
      const startX = z.x - fullWidth / 2;
      const textY = z.y - bodyH / 2 - 14;
      ctx.fillStyle = errorLocked ? '#f43f5e' : '#22c55e';
      ctx.fillText(typed, startX + typedWidth / 2, textY);
      ctx.fillStyle = errorLocked ? '#fca5a5' : '#f8fafc';
      ctx.fillText(untyped, startX + typedWidth + ctx.measureText(untyped).width / 2, textY);

      // 血条（多血僵尸）
      if (z.maxHp > 1) {
        const hpW = bodyW * (z.hp / z.maxHp);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(z.x - bodyW / 2, z.y - bodyH / 2 - 6, hpW, 4);
      }
    }

    // 错误字符标注
    if (errorActive && lastError) {
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
    }

    // 波次横幅
    const flashAt = this.state.levelClearFlashAt;
    if (this.state.isRunning && flashAt !== undefined && now - flashAt < 1200) {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`第 ${this.state.level - 1} 波 防守成功！`, width / 2, height / 2 - 60);
    }

    // 结算页
    if (this.state.victory || (!this.state.isRunning && this.state.lives <= 0)) {
      this.drawSettlement(
        this.state.victory ? '防守成功！' : '基地失守',
        this.state.victory ? '#22c55e' : '#f43f5e'
      );
    }
  }

  /**
   * 绘制可辨识的僵尸造型（头/躯干/手臂/腿），带步态摆动；
   * 按类型区分体型与配色，并为坦克/BOSS/快速添加专属细节。
   * 造型以 (z.x, z.y) 为中心，不遮挡上方携带单词与血条。
   */
  private drawZombieBody(
    z: Zombie,
    now: number,
    isLocked: boolean,
    errorLocked: boolean,
    frozen: boolean
  ): void {
    const ctx = this.ctx;
    const { w, h } = zombieDims(z.kind);
    const palette = ZOMBIE_PALETTE[z.kind];
    const skin = frozen ? '#7dd3fc' : palette.skin;
    const clothes = frozen ? '#38bdf8' : palette.clothes;
    const phase = now / 260 + z.id * 0.7;
    const lean = Math.sin(phase) * 0.09;
    const swing = Math.sin(phase) * 0.35;

    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(lean);

    // 腿（前后摆动）
    ctx.fillStyle = clothes;
    const legW = w * 0.16;
    const legH = h * 0.34;
    ctx.fillRect(-w * 0.2 + swing * 3, h * 0.16, legW, legH);
    ctx.fillRect(w * 0.06 - swing * 3, h * 0.16, legW, legH);

    // 躯干
    ctx.fillStyle = clothes;
    ctx.fillRect(-w * 0.26, -h * 0.18, w * 0.52, h * 0.38);

    // 手臂（前伸的经典僵尸姿态，随步态摆动）
    ctx.fillStyle = skin;
    const armW = w * 0.14;
    const armH = h * 0.3;
    ctx.save();
    ctx.translate(-w * 0.26, -h * 0.1);
    ctx.rotate(-0.5 + swing * 0.3);
    ctx.fillRect(-armW, 0, armW, armH);
    ctx.restore();
    ctx.save();
    ctx.translate(w * 0.26, -h * 0.1);
    ctx.rotate(0.5 - swing * 0.3);
    ctx.fillRect(0, 0, armW, armH);
    ctx.restore();

    // 头
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -h * 0.32, w * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#0f172a';
    const eyeR = Math.max(1.5, w * 0.04);
    ctx.beginPath();
    ctx.arc(-w * 0.08, -h * 0.35, eyeR, 0, Math.PI * 2);
    ctx.arc(w * 0.08, -h * 0.35, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // 类型专属细节
    if (z.kind === 'tank') {
      // 护甲边框
      ctx.strokeStyle = '#1a2e05';
      ctx.lineWidth = 3;
      ctx.strokeRect(-w * 0.26, -h * 0.18, w * 0.52, h * 0.38);
    } else if (z.kind === 'boss') {
      // 犄角
      ctx.strokeStyle = '#fecdd3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-w * 0.14, -h * 0.46);
      ctx.lineTo(-w * 0.24, -h * 0.62);
      ctx.moveTo(w * 0.14, -h * 0.46);
      ctx.lineTo(w * 0.24, -h * 0.62);
      ctx.stroke();
    } else if (z.kind === 'fast') {
      // 疾速线
      ctx.strokeStyle = 'rgba(253,224,71,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.55, -h * 0.12);
      ctx.lineTo(-w * 0.34, -h * 0.12);
      ctx.moveTo(-w * 0.55, h * 0.06);
      ctx.lineTo(-w * 0.34, h * 0.06);
      ctx.stroke();
    }

    // 锁定/错误描边
    if (isLocked) {
      ctx.strokeStyle = errorLocked ? '#f43f5e' : '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.42, -h * 0.56, w * 0.84, h * 1.08);
    }

    ctx.restore();
  }

  /** 结算页：得分 / 坚守波次 / 击杀 / 道具 */
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
    ctx.fillText(title, width / 2, height / 2 - 60);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '24px sans-serif';
    ctx.fillText(`最终得分: ${this.state.score}`, width / 2, height / 2);
    ctx.fillText(`坚守波次: ${this.state.wavesCleared}`, width / 2, height / 2 + 35);
    ctx.fillText(`击杀僵尸: ${this.state.kills}`, width / 2, height / 2 + 70);
    ctx.fillText(`拾取道具: ${this.state.items}`, width / 2, height / 2 + 105);
  }
}
