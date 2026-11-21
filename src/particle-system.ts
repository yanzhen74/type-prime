/**
 * 粒子系统（块三表现层打磨任务 5 的第二步，详见 PLAN.md §10.4.2）。
 *
 * 轻量粒子池 + 纯 Canvas 2D 绘制：不引入图片资源与第三方依赖，
 * 把「命中 / 击杀 / 击毁 / 落地 / 受伤 / 回补 / 升关」等瞬时事件做成可见的
 * 火花、爆散碎块与烟尘，取代原先纯装饰性的 emoji 飘字（带信息量的文案飘字保留）。
 *
 * 计时口径遵循帧内计时不变量：粒子只按调用方注入的 dt 推进，内部绝不取
 * performance.now()，因此 tick(0)/tick(16) 这类合成时间单测可精确断言。
 * 单帧步长上限 MAX_PARTICLE_STEP 用于吸收切标签页后的巨大 dt，避免粒子瞬移。
 */

/** 粒子形状：实心碎块 / 拖尾火花 / 扩散烟团 / 冲击环 */
export type ParticleShape = 'dot' | 'spark' | 'smoke' | 'ring';

export interface Particle {
  x: number;
  y: number;
  /** 速度 px/ms */
  vx: number;
  vy: number;
  /** 速度增量 px/ms² */
  gravity: number;
  /** 每毫秒速度衰减比例（0 表示不衰减） */
  drag: number;
  age: number;
  ttl: number;
  /** 基准半径 px */
  size: number;
  color: string;
  shape: ParticleShape;
}

/** 一次事件产生的粒子群参数（纯数据，便于调参与单测） */
export interface BurstSpec {
  count: number;
  /** 基准速度 px/ms */
  speed: number;
  /** 速度随机浮动比例 0–1 */
  spread: number;
  /** 主方向弧度；缺省为全向 */
  direction?: number;
  /** 主方向扇形半角；配合 direction 使用 */
  arc?: number;
  ttl: number;
  size: number;
  gravity: number;
  drag: number;
  colors: string[];
  shape: ParticleShape;
}

/** 预设事件名：三个游戏模式按语义共用 */
export type ParticlePreset =
  'hit' | 'kill' | 'destroy' | 'splat' | 'hurt' | 'heal' | 'levelup' | 'boss';

/**
 * 预设参数表：逐字符级的 hit 刻意小而短，事件级的 kill/levelup 更大更久；
 * splat/heal 用负重力或低重力让烟尘与光点上飘。
 */
export const PARTICLE_PRESETS: Record<ParticlePreset, BurstSpec> = {
  hit: {
    count: 6,
    speed: 0.12,
    spread: 0.5,
    ttl: 260,
    size: 2,
    gravity: 0.0006,
    drag: 0.004,
    colors: ['#fde68a', '#facc15', '#f8fafc'],
    shape: 'spark',
  },
  kill: {
    count: 18,
    speed: 0.22,
    spread: 0.6,
    ttl: 620,
    size: 3,
    gravity: 0.0012,
    drag: 0.002,
    colors: ['#22c55e', '#a3e635', '#4ade80', '#f43f5e'],
    shape: 'dot',
  },
  destroy: {
    count: 14,
    speed: 0.2,
    spread: 0.6,
    ttl: 520,
    size: 2.6,
    gravity: 0.001,
    drag: 0.0025,
    colors: ['#38bdf8', '#22c55e', '#f8fafc'],
    shape: 'dot',
  },
  splat: {
    count: 8,
    speed: 0.06,
    spread: 0.7,
    ttl: 700,
    size: 5,
    gravity: -0.00005,
    drag: 0.006,
    colors: ['#94a3b8', '#64748b', '#cbd5e1'],
    shape: 'smoke',
  },
  hurt: {
    count: 12,
    speed: 0.18,
    spread: 0.5,
    direction: -Math.PI / 2,
    arc: Math.PI / 3,
    ttl: 480,
    size: 2.6,
    gravity: 0.0016,
    drag: 0.002,
    colors: ['#f43f5e', '#fb7185', '#f59e0b'],
    shape: 'dot',
  },
  heal: {
    count: 10,
    speed: 0.09,
    spread: 0.4,
    direction: -Math.PI / 2,
    arc: Math.PI / 4,
    ttl: 700,
    size: 2.4,
    gravity: -0.0002,
    drag: 0.003,
    colors: ['#22c55e', '#4ade80', '#a7f3d0'],
    shape: 'dot',
  },
  levelup: {
    count: 24,
    speed: 0.26,
    spread: 0.5,
    ttl: 900,
    size: 2.8,
    gravity: 0.0012,
    drag: 0.0015,
    colors: ['#38bdf8', '#facc15', '#22c55e', '#f472b6'],
    shape: 'spark',
  },
  boss: {
    count: 16,
    speed: 0.14,
    spread: 0.3,
    ttl: 520,
    size: 3,
    gravity: 0,
    drag: 0.006,
    colors: ['#a855f7', '#7c3aed', '#f8fafc'],
    shape: 'spark',
  },
};

/** 单帧步长上限，吸收切标签页/rAF 停顿后的巨大 dt */
export const MAX_PARTICLE_STEP = 50;
/** 粒子上限：超出时丢弃最老的，避免长时间游玩无限增长 */
export const MAX_PARTICLES = 400;

export interface ParticleSystemOptions {
  /** 确定性随机源（供测试） */
  rng?: () => number;
  /** 粒子上限，默认 MAX_PARTICLES */
  max?: number;
}

/**
 * 粒子池：游戏实例各自持有一份（不进入 state，避免污染 onUpdate 与既有测试），
 * 在 update 里按 dt 推进、在 draw 末尾叠加绘制，reset 时清空。
 */
export class ParticleSystem {
  private readonly particles: Particle[] = [];
  private readonly rng: () => number;
  private readonly max: number;

  constructor(options: ParticleSystemOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.max = options.max ?? MAX_PARTICLES;
  }

  get count(): number {
    return this.particles.length;
  }

  /** 按预设发射一群粒子；scale 放大数量与尺寸（BOSS/坦克用更大的爆散） */
  burst(x: number, y: number, preset: ParticlePreset, scale = 1): void {
    const spec = PARTICLE_PRESETS[preset];
    if (!spec) return;
    this.emit(x, y, spec, scale);
  }

  /** 自定义发射：颜色/数量等由调用方给定的 spec 决定 */
  emit(x: number, y: number, spec: BurstSpec, scale = 1): void {
    const factor = Math.max(0.1, scale);
    const count = Math.max(1, Math.round(spec.count * factor));
    const speedScale = 1 + (factor - 1) * 0.3;
    for (let i = 0; i < count; i++) {
      const angle =
        spec.direction !== undefined
          ? spec.direction + (this.rng() * 2 - 1) * (spec.arc ?? Math.PI / 4)
          : this.rng() * Math.PI * 2;
      const speed = spec.speed * (1 - spec.spread + this.rng() * 2 * spec.spread) * speedScale;
      const color = spec.colors[Math.floor(this.rng() * spec.colors.length)] ?? spec.colors[0];
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: spec.gravity,
        drag: spec.drag,
        age: 0,
        ttl: spec.ttl * (0.8 + this.rng() * 0.4),
        size: spec.size * (0.8 + this.rng() * 0.5) * Math.min(1.5, factor),
        color,
        shape: spec.shape,
      });
    }

    // 超出上限时丢弃最老的粒子（保留最新的一批）
    const overflow = this.particles.length - this.max;
    if (overflow > 0) {
      this.particles.splice(0, overflow);
    }
  }

  /** 冲击环：单个扩散圆环，用于 BOSS 登场与升关 */
  ring(x: number, y: number, color: string, size = 12, ttl = 320): void {
    if (this.particles.length >= this.max) {
      this.particles.shift();
    }
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 0,
      age: 0,
      ttl,
      size,
      color,
      shape: 'ring',
    });
  }

  /** 按注入的 dt 推进：老化、衰减、位移，并移除寿命到期的粒子 */
  update(dt: number): void {
    const step = Math.min(Math.max(0, dt), MAX_PARTICLE_STEP);
    if (step === 0) return;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += step;
      if (p.age >= p.ttl) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.drag > 0) {
        const damping = Math.max(0, 1 - p.drag * step);
        p.vx *= damping;
        p.vy *= damping;
      }
      p.vy += p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
    }
  }

  /** 叠加绘制：按剩余寿命淡出，形状决定画法 */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const t = Math.min(1, p.age / p.ttl);
      const alpha = 1 - t;
      ctx.globalAlpha = alpha;
      if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.8);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 12, p.y - p.vy * 12);
        ctx.stroke();
      } else if (p.shape === 'smoke') {
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 3 * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 2.2), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - t * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** 清空粒子池（reset / 切换模式时调用） */
  clear(): void {
    this.particles.length = 0;
  }

  /** 只读快照：供测试与调试观察粒子轨迹，不参与任何游戏判定 */
  snapshot(): readonly Particle[] {
    return this.particles;
  }
}
