import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeFallSpeed, computeSpawnInterval, computeLevel, FallingWordGame } from './game.js';
import type { GameState } from './types.js';

describe('游戏难度纯函数', () => {
  it('computeFallSpeed 按等级/随机因子递增并整体乘以速度倍率', () => {
    expect(computeFallSpeed(1, 1, 0)).toBeCloseTo(0.8 + 0.25);
    expect(computeFallSpeed(5, 1, 0)).toBeCloseTo(0.8 + 5 * 0.25);
    // 速度倍率线性放大
    expect(computeFallSpeed(1, 2, 0)).toBeCloseTo((0.8 + 0.25) * 2);
    expect(computeFallSpeed(1, 0.5, 0)).toBeCloseTo((0.8 + 0.25) * 0.5);
    // 随机因子贡献 0~0.5
    expect(computeFallSpeed(1, 1, 1)).toBeCloseTo(0.8 + 0.25 + 0.5);
  });

  it('computeSpawnInterval 随等级缩短且有 1200ms 下限', () => {
    expect(computeSpawnInterval(1)).toBe(2300);
    expect(computeSpawnInterval(5)).toBe(1500);
    expect(computeSpawnInterval(10)).toBe(1200);
    expect(computeSpawnInterval(50)).toBe(1200);
  });

  it('computeLevel 每 100 分升一级，以 startingLevel 为基准', () => {
    expect(computeLevel(0, 1)).toBe(1);
    expect(computeLevel(99, 1)).toBe(1);
    expect(computeLevel(100, 1)).toBe(2);
    expect(computeLevel(0, 5)).toBe(5);
    expect(computeLevel(250, 5)).toBe(7);
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
});
