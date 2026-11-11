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
/** 炮弹飞行速度（px/ms） */
const PROJECTILE_SPEED = 1.2;
/** 炮弹存活上限（ms） */
const PROJECTILE_TTL = 1500;
/** 跳弹重力加速度（px/ms²） */
const PROJECTILE_GRAVITY = 0.004;

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

/** 头部血条显示比例（含本轮已命中字符的平滑掉血） */
export function headBarFraction(z: Zombie): number {
  const progress = Math.min(z.shownChars, z.text.length) / Math.max(1, z.text.length);
  return Math.max(0, Math.min(1, (z.hp - 1 + progress) / z.maxHp));
}

/** 血条颜色：坦克三段（蓝护甲 / 黄 / 红），其余类型红 */
export function zombieBarColor(kind: ZombieKind, hp: number): string {
  if (kind === 'tank') {
    return hp >= 3 ? '#38bdf8' : hp === 2 ? '#facc15' : '#ef4444';
  }
  return '#ef4444';
}

/** 道具类型：修复基地 / 冻结全场 / 直接加分 */
export type ZombieItem = 'heal' | 'freeze' | 'score';
const ITEMS: ZombieItem[] = ['heal', 'freeze', 'score'];

/** 音效钩子事件名（预留给 sound-manager） */
export type ZombieSfx = 'shoot' | 'hit' | 'kill' | 'miss' | 'miss-hit' | 'splat';

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

/** 僵尸大战选项：通用选项 + 确定性随机源 + 可选词源 + 音效钩子 */
export interface ZombieOptions extends GameEngineOptions {
  rng?: () => number;
  wordProvider?: () => string;
  onSfx?: (name: ZombieSfx) => void;
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
  private readonly sfx?: (name: ZombieSfx) => void;
  private lastSpawn = 0;
  private nextId = 1;
  private nextProjectileId = 1;
  private plantRecoilAt = -1;
  private misfireStreak = 0;
  private lastUpdateAt = -1;
  /** 最近一次 update 的时间戳（供炮弹 TTL 等帧内计时使用） */
  private frameNow = 0;

  constructor(
    canvasId: string,
    onUpdate: (state: ZombieState) => void,
    onGameOver: (score: number) => void,
    options: ZombieOptions = {}
  ) {
    super(canvasId, { onUpdate, onGameOver }, options);
    this.rng = options.rng ?? Math.random;
    this.wordProvider = options.wordProvider;
    this.sfx = options.onSfx;
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
      projectiles: [],
      effects: [],
    };
  }

  protected onResume(): void {
    this.lastSpawn = performance.now();
    // 避免暂停/重新开始后的首个大 dt 让炮弹瞬移
    this.lastUpdateAt = -1;
  }

  protected onChar(char: string): void {
    if (this.state.lockedZombieIndex === null) {
      const match = this.findMatchingZombie(char);
      if (match === null) {
        this.recordError(char);
        this.fireProjectile(-1, true, char);
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
      this.fireProjectile(zombie.id, false);
      if (zombie.typedIndex >= zombie.text.length) {
        this.hitZombie(this.state.lockedZombieIndex);
      } else {
        this.emitUpdate();
      }
    } else {
      this.recordError(char);
      this.fireProjectile(zombie.id, true, char);
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
    this.sfx?.('kill');
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
      shownChars: 0,
    });
  }

  protected update(now: number): void {
    this.frameNow = now;
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

    // 炮弹飞行与命中/跳弹/落地（冻结期间仍飞行）
    const dt = this.lastUpdateAt < 0 ? 0 : now - this.lastUpdateAt;
    this.lastUpdateAt = now;
    this.updateProjectiles(now, dt);

    if (frozen) return;

    for (let i = this.state.zombies.length - 1; i >= 0; i--) {
      const z = this.state.zombies[i];
      // 命中顿挫期间暂停移动
      if (z.staggerUntil === undefined || now >= z.staggerUntil) {
        z.y += z.speed;
      }

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

  /** 植物炮台位置（基地线上方居中） */
  private plantPos(): { x: number; y: number } {
    return { x: this.canvas.width / 2, y: this.canvas.height - 30 - 16 };
  }

  /** 发射炮弹：miss 为打错字符的哑弹；targetId=-1 表示无目标注定落空 */
  private fireProjectile(targetId: number, miss: boolean, char?: string): void {
    const plant = this.plantPos();
    this.state.projectiles.push({
      id: this.nextProjectileId++,
      x: plant.x,
      y: plant.y - 16,
      targetId,
      at: this.frameNow,
      miss,
      char,
    });
    this.plantRecoilAt = performance.now();
    this.misfireStreak = miss ? this.misfireStreak + 1 : 0;
    this.sfx?.(miss ? 'miss' : 'shoot');
  }

  /** 炮弹模拟：追踪命中 / 哑弹跳弹 / 触地 splat / 目标死亡 fizzle */
  private updateProjectiles(now: number, dt: number): void {
    const ground = this.canvas.height - 30;
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
      const p = this.state.projectiles[i];
      const target = this.state.zombies.find((z) => z.id === p.targetId);

      // 跳弹/落空物理
      if (p.vx !== undefined && p.vy !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += PROJECTILE_GRAVITY * dt;
        if (p.y >= ground || now - p.at > PROJECTILE_TTL) {
          this.state.effects.push({
            x: p.x,
            y: Math.min(p.y, ground),
            at: now,
            text: this.rng() < 0.15 ? '🥀' : '💨',
          });
          this.state.projectiles.splice(i, 1);
          this.sfx?.('splat');
        }
        continue;
      }

      // 无目标：哑弹抛出注定落空；实弹目标已死亡则 fizzle
      if (!target) {
        if (p.miss) {
          p.vx = 0.25;
          p.vy = -0.45;
        } else {
          this.state.projectiles.splice(i, 1);
        }
        continue;
      }

      // 追踪目标
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = PROJECTILE_SPEED * dt;
      if (dist <= step + 6) {
        if (p.miss) {
          // 接触但零伤害：跳弹 + ✗错字符飘字
          p.vx = dx >= 0 ? -0.3 : 0.3;
          p.vy = -0.4;
          target.staggerUntil = now + 80;
          this.state.effects.push({ x: target.x, y: target.y, at: now, text: `✗${p.char ?? ''}` });
          this.sfx?.('miss-hit');
        } else {
          target.shownChars = Math.min(target.shownChars + 1, target.text.length);
          target.flashUntil = now + 120;
          target.staggerUntil = now + 60;
          this.state.effects.push({ x: target.x, y: target.y, at: now, text: '✦' });
          this.state.projectiles.splice(i, 1);
          this.sfx?.('hit');
        }
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  /** 绘制植物炮台：茎+朝目标的头+炮口，含后坐与 muzzle flash */
  private drawPlant(now: number): void {
    const ctx = this.ctx;
    const { x, y } = this.plantPos();
    const locked =
      this.state.lockedZombieIndex !== null
        ? this.state.zombies[this.state.lockedZombieIndex]
        : undefined;
    const aim = locked ? Math.atan2(locked.y - y, locked.x - x) : -Math.PI / 2;
    const sinceFire = now - this.plantRecoilAt;
    const recoil =
      sinceFire >= 0 && sinceFire < 120 ? (1 - sinceFire / 120) * (4 + this.misfireStreak * 2) : 0;

    // 茎
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, this.canvas.height - 30);
    ctx.lineTo(x, y + 6);
    ctx.stroke();

    // 头（朝目标，含后坐）
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim + Math.PI / 2);
    ctx.translate(0, recoil);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15803d';
    ctx.fillRect(-4, -18, 8, 10);
    if (sinceFire >= 0 && sinceFire < 80) {
      ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
      ctx.beginPath();
      ctx.arc(0, -20, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 连续打错的灰烟
    if (this.misfireStreak > 0 && sinceFire >= 0 && sinceFire < 300) {
      ctx.fillStyle = `rgba(148, 163, 184, ${0.5 - sinceFire / 600})`;
      ctx.beginPath();
      ctx.arc(x + 8, y - 14, 4 + this.misfireStreak, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 绘制炮弹：实弹绿+光尾，哑弹灰+烟尾 */
  private drawProjectiles(): void {
    const ctx = this.ctx;
    for (const p of this.state.projectiles) {
      const deflected = p.vx !== undefined;
      ctx.fillStyle = p.miss ? '#94a3b8' : '#a3e635';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.miss ? 4 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.miss ? 'rgba(148, 163, 184, 0.5)' : 'rgba(163, 230, 53, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      if (deflected) {
        ctx.lineTo(p.x - (p.vx ?? 0) * 40, p.y - (p.vy ?? 0) * 40);
      } else {
        ctx.lineTo(p.x, p.y + 10);
      }
      ctx.stroke();
    }
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

    // 植物炮台
    this.drawPlant(now);

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
      const textY = z.y - bodyH / 2 - 24;
      ctx.fillStyle = errorLocked ? '#f43f5e' : '#22c55e';
      ctx.fillText(typed, startX + typedWidth / 2, textY);
      ctx.fillStyle = errorLocked ? '#fca5a5' : '#f8fafc';
      ctx.fillText(untyped, startX + typedWidth + ctx.measureText(untyped).width / 2, textY);

      // 头部血条（全僵尸，逐字符平滑掉血；坦克三段变色）
      const barY = z.y - bodyH / 2 - 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.fillRect(z.x - bodyW / 2, barY, bodyW, 4);
      ctx.fillStyle = zombieBarColor(z.kind, z.hp);
      ctx.fillRect(z.x - bodyW / 2, barY, bodyW * headBarFraction(z), 4);

      // 命中白闪
      if (z.flashUntil !== undefined && now < z.flashUntil) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillRect(z.x - bodyW / 2, z.y - bodyH / 2, bodyW, bodyH);
      }
    }

    // 炮弹
    this.drawProjectiles();

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
