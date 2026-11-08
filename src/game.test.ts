import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeFallSpeed, computeSpawnInterval, FallingWordGame } from './game.js';
import type { GameState } from './types.js';

describe('游戏难度纯函数', () => {
  it('computeFallSpeed 采用饱和曲线：递增但斜率递减、有上限，并整体乘以速度倍率', () => {
    const f = (lv: number, m = 1, r = 0) => computeFallSpeed(lv, m, r);
    // 与饱和曲线公式一致
    expect(f(1)).toBeCloseTo(0.7 + 1.8 * (1 - Math.exp(-1 / 8)));
    // 单调递增
    expect(f(10)).toBeGreaterThan(f(1));
    // 斜率递减（各关难度斜率平缓）：低段增量 > 高段增量
    expect(f(2) - f(1)).toBeGreaterThan(f(11) - f(10));
    // 有上限：base + gain + jitter
    expect(f(100, 1, 1)).toBeLessThanOrEqual(0.7 + 1.8 + 0.4 + 1e-9);
    // 速度倍率线性放大
    expect(f(1, 2)).toBeCloseTo(2 * f(1, 1));
    expect(f(1, 0.5)).toBeCloseTo(0.5 * f(1, 1));
    // 随机因子贡献 0~0.4
    expect(f(1, 1, 1)).toBeCloseTo(f(1, 1, 0) + 0.4);
  });

  it('computeSpawnInterval 随等级缓慢缩短且有 1400ms 下限', () => {
    expect(computeSpawnInterval(1)).toBe(2330);
    expect(computeSpawnInterval(10)).toBe(1700);
    expect(computeSpawnInterval(15)).toBe(1400);
    expect(computeSpawnInterval(50)).toBe(1400);
  });
});

/** 最小 2D 上下文桩：方法调用一律 no-op，measureText 返回固定宽度，属性写入被吞掉 */
function createMockCtx(): CanvasRenderingContext2D {
  const base = {
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      return () => undefined;
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('FallingWordGame 起始等级接线', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.width = 800;
    canvas.height = 500;
    // 覆盖 getContext，避免 jsdom 未实现 2D 上下文导致构造抛错
    (canvas as unknown as { getContext: () => unknown }).getContext = () => createMockCtx();
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('startingLevel 决定初始等级', () => {
    const box: { state: GameState | null } = { state: null };
    const game = new FallingWordGame(
      'game-canvas',
      (s) => {
        box.state = s;
      },
      () => {},
      { startingLevel: 5 }
    );
    game.start();
    expect(box.state?.level).toBe(5);
  });

  it('applyOptions 重设起始等级并反映到状态', () => {
    const box: { state: GameState | null } = { state: null };
    const game = new FallingWordGame(
      'game-canvas',
      (s) => {
        box.state = s;
      },
      () => {}
    );
    game.applyOptions({ startingLevel: 8 });
    expect(box.state?.level).toBe(8);
    game.start();
    expect(box.state?.level).toBe(8);
  });

  it('初始生命为 5（提高容错、不轻易劝退）', () => {
    const box: { state: GameState | null } = { state: null };
    const game = new FallingWordGame(
      'game-canvas',
      (s) => {
        box.state = s;
      },
      () => {}
    );
    game.start();
    expect(box.state?.lives).toBe(5);
  });
});
