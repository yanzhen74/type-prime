import { describe, expect, it } from 'vitest';
import {
  MAX_PARTICLES,
  MAX_PARTICLE_STEP,
  PARTICLE_PRESETS,
  ParticleSystem,
  type ParticlePreset,
  type ParticleShape,
} from './particle-system.js';

/** 确定性随机源：rng 恒 0 时方向为 0 弧度、速度取下限、颜色取首个、ttl/size 取 0.8 倍 */
const zeroRng = () => 0;

const SHAPES: ParticleShape[] = ['dot', 'spark', 'smoke', 'ring'];

function makeCtx() {
  const calls = {
    save: 0,
    restore: 0,
    beginPath: 0,
    fill: 0,
    stroke: 0,
    moveTo: 0,
    lineTo: 0,
    arcs: [] as number[],
    alphas: [] as number[],
  };
  let alpha = 1;
  const ctx = {
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(value: number) {
      alpha = value;
      calls.alphas.push(value);
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    save: () => {
      calls.save += 1;
    },
    restore: () => {
      calls.restore += 1;
    },
    beginPath: () => {
      calls.beginPath += 1;
    },
    arc: (_x: number, _y: number, r: number) => {
      calls.arcs.push(r);
    },
    fill: () => {
      calls.fill += 1;
    },
    stroke: () => {
      calls.stroke += 1;
    },
    moveTo: () => {
      calls.moveTo += 1;
    },
    lineTo: () => {
      calls.lineTo += 1;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('PARTICLE_PRESETS 预设表', () => {
  it('覆盖全部预设名且参数合法', () => {
    const names = Object.keys(PARTICLE_PRESETS) as ParticlePreset[];
    expect(names).toEqual(['hit', 'kill', 'destroy', 'splat', 'hurt', 'heal', 'levelup', 'boss']);
    for (const name of names) {
      const spec = PARTICLE_PRESETS[name];
      expect(spec.count).toBeGreaterThan(0);
      expect(spec.speed).toBeGreaterThan(0);
      expect(spec.ttl).toBeGreaterThan(0);
      expect(spec.size).toBeGreaterThan(0);
      expect(spec.spread).toBeGreaterThanOrEqual(0);
      expect(spec.spread).toBeLessThanOrEqual(1);
      expect(spec.colors.length).toBeGreaterThan(0);
      expect(SHAPES).toContain(spec.shape);
    }
  });

  it('逐字符级的 hit 比事件级的 kill 更短更小', () => {
    expect(PARTICLE_PRESETS.hit.count).toBeLessThan(PARTICLE_PRESETS.kill.count);
    expect(PARTICLE_PRESETS.hit.ttl).toBeLessThan(PARTICLE_PRESETS.kill.ttl);
  });

  it('splat 与 heal 用非正重力让烟尘与光点上飘', () => {
    expect(PARTICLE_PRESETS.splat.gravity).toBeLessThanOrEqual(0);
    expect(PARTICLE_PRESETS.heal.gravity).toBeLessThanOrEqual(0);
  });

  it('hurt / heal 限定为向上的扇形喷射', () => {
    for (const name of ['hurt', 'heal'] as ParticlePreset[]) {
      const spec = PARTICLE_PRESETS[name];
      expect(spec.direction).toBe(-Math.PI / 2);
      expect(spec.arc).toBeGreaterThan(0);
    }
  });
});

describe('ParticleSystem 发射', () => {
  it('按预设数量发射，count 随 scale 变化', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(10, 20, 'kill');
    expect(system.count).toBe(PARTICLE_PRESETS.kill.count);

    const boss = new ParticleSystem({ rng: zeroRng });
    boss.burst(10, 20, 'kill', 1.8);
    expect(boss.count).toBe(Math.round(PARTICLE_PRESETS.kill.count * 1.8));
  });

  it('rng 恒 0 时方向、颜色、寿命与尺寸可预测', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(10, 20, 'hit');
    const spec = PARTICLE_PRESETS.hit;
    const [p] = system.snapshot();
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    // angle=0 → 全速沿 x 轴，速度取 spread 下限
    expect(p.vx).toBeCloseTo(spec.speed * (1 - spec.spread), 10);
    expect(p.vy).toBe(0);
    expect(p.color).toBe(spec.colors[0]);
    expect(p.ttl).toBeCloseTo(spec.ttl * 0.8, 10);
    expect(p.size).toBeCloseTo(spec.size * 0.8, 10);
    expect(p.shape).toBe('spark');
  });

  it('scale 放大速度的幅度小于放大数量的幅度', () => {
    const base = new ParticleSystem({ rng: zeroRng });
    base.burst(0, 0, 'kill');
    const big = new ParticleSystem({ rng: zeroRng });
    big.burst(0, 0, 'kill', 2);
    const baseSpeed = base.snapshot()[0].vx;
    expect(big.snapshot()[0].vx).toBeCloseTo(baseSpeed * 1.3, 10);
  });

  it('自定义 spec 可指定颜色与形状', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.emit(1, 2, {
      count: 3,
      speed: 0.1,
      spread: 0,
      ttl: 100,
      size: 4,
      gravity: 0,
      drag: 0,
      colors: ['#ff0000'],
      shape: 'smoke',
    });
    expect(system.count).toBe(3);
    expect(system.snapshot().every((p) => p.color === '#ff0000' && p.shape === 'smoke')).toBe(true);
  });

  it('未知预设名安全忽略', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'nope' as ParticlePreset);
    expect(system.count).toBe(0);
  });

  it('ring 发射单个不移动的冲击环', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.ring(5, 6, '#22c55e', 12, 320);
    expect(system.count).toBe(1);
    const [p] = system.snapshot();
    expect(p.shape).toBe('ring');
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.ttl).toBe(320);
    system.update(16);
    expect(system.snapshot()[0].x).toBe(5);
  });

  it('超出上限时丢弃最老的粒子', () => {
    const system = new ParticleSystem({ rng: zeroRng, max: 5 });
    system.burst(0, 0, 'kill');
    expect(system.count).toBe(5);
    expect(system.snapshot().every((p) => p.age === 0)).toBe(true);
  });

  it('默认上限为 MAX_PARTICLES', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    for (let i = 0; i < 40; i++) {
      system.burst(0, 0, 'levelup');
    }
    expect(system.count).toBeLessThanOrEqual(MAX_PARTICLES);
  });
});

describe('ParticleSystem 推进', () => {
  it('按 dt 位移，重力累加 vy，drag 衰减速度', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(10, 20, 'hit');
    const before = { ...system.snapshot()[0] };
    system.update(16);
    const p = system.snapshot()[0];
    expect(p.age).toBe(16);
    expect(p.vx).toBeLessThan(before.vx);
    expect(p.vy).toBeCloseTo(before.gravity * 16, 10);
    expect(p.x).toBeGreaterThan(10);
    expect(p.y).toBeGreaterThan(20);
  });

  it('寿命到期后移除粒子', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'hit');
    const ttl = system.snapshot()[0].ttl; // 260 * 0.8 = 208
    const frames = Math.ceil(ttl / 16);
    for (let i = 0; i < frames - 1; i++) system.update(16);
    expect(system.count).toBe(PARTICLE_PRESETS.hit.count);
    system.update(16);
    expect(system.count).toBe(0);
  });

  it('单帧步长上限吸收巨大 dt', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'levelup');
    system.update(100000);
    expect(system.snapshot()[0].age).toBe(MAX_PARTICLE_STEP);
    expect(system.count).toBe(PARTICLE_PRESETS.levelup.count);
  });

  it('dt <= 0 时不推进也不老化', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(3, 4, 'kill');
    system.update(0);
    system.update(-50);
    const [p] = system.snapshot();
    expect(p.age).toBe(0);
    expect(p.x).toBe(3);
    expect(p.y).toBe(4);
  });

  it('clear 清空粒子池', () => {
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'kill');
    system.clear();
    expect(system.count).toBe(0);
  });
});

describe('ParticleSystem 绘制', () => {
  it('空池不触碰画布', () => {
    const { ctx, calls } = makeCtx();
    new ParticleSystem({ rng: zeroRng }).draw(ctx);
    expect(calls.save).toBe(0);
    expect(calls.beginPath).toBe(0);
  });

  it('dot 形状逐粒子填充圆形', () => {
    const { ctx, calls } = makeCtx();
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'kill');
    system.draw(ctx);
    expect(calls.save).toBe(1);
    expect(calls.restore).toBe(1);
    expect(calls.fill).toBe(system.count);
    expect(calls.arcs.length).toBe(system.count);
    expect(calls.stroke).toBe(0);
  });

  it('spark 形状画拖尾线段', () => {
    const { ctx, calls } = makeCtx();
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'hit');
    system.draw(ctx);
    expect(calls.stroke).toBe(system.count);
    expect(calls.moveTo).toBe(system.count);
    expect(calls.lineTo).toBe(system.count);
    expect(calls.fill).toBe(0);
  });

  it('smoke 形状半透明且半径随寿命膨胀', () => {
    const { ctx, calls } = makeCtx();
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'splat');
    const { size, ttl } = system.snapshot()[0];
    for (let i = 0; i < 5; i++) system.update(MAX_PARTICLE_STEP);
    system.draw(ctx);
    const t = (5 * MAX_PARTICLE_STEP) / ttl;
    expect(calls.fill).toBe(system.count);
    expect(calls.arcs[0]).toBeCloseTo(size * (1 + t * 1.6), 6);
    // 先设淡出 alpha，再乘 0.5 降低烟雾存在感
    expect(calls.alphas[1]).toBeCloseTo(calls.alphas[0] * 0.5, 10);
  });

  it('ring 形状描边扩散圆环', () => {
    const { ctx, calls } = makeCtx();
    const system = new ParticleSystem({ rng: zeroRng });
    system.ring(0, 0, '#a855f7', 16, 520);
    system.update(MAX_PARTICLE_STEP);
    system.draw(ctx);
    expect(calls.stroke).toBe(1);
    expect(calls.fill).toBe(0);
    expect(calls.arcs[0]).toBeGreaterThan(16);
  });

  it('globalAlpha 随寿命线性淡出', () => {
    const { ctx, calls } = makeCtx();
    const system = new ParticleSystem({ rng: zeroRng });
    system.burst(0, 0, 'kill');
    const ttl = system.snapshot()[0].ttl; // 620 * 0.8 = 496
    for (let i = 0; i < 5; i++) system.update(MAX_PARTICLE_STEP);
    system.draw(ctx);
    expect(calls.alphas[0]).toBeCloseTo(1 - (5 * MAX_PARTICLE_STEP) / ttl, 6);
  });
});
