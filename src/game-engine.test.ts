import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from './game-engine.js';
import type { TypingEngine } from './input.js';
import type { GameBaseState, TypingEvent } from './types.js';

interface TestState extends GameBaseState {
  hits: number;
}

/** 最小具体子类：仅记录输入，用于验证基类循环/门控/输入路由 */
class TestGame extends GameEngine<TestState> {
  chars: string[] = [];
  backspaces = 0;
  submits = 0;

  protected createState(): TestState {
    return { ...this.createBaseState(), lives: 3, hits: 0 };
  }
  protected update(): void {}
  protected draw(): void {}
  protected onChar(char: string): void {
    this.chars.push(char);
    this.state.hits += 1;
  }
  protected onBackspace(): void {
    this.backspaces += 1;
  }
  protected onSubmit(): void {
    this.submits += 1;
  }
  triggerGameOver(): void {
    this.gameOver();
  }
}

/** 最小 2D 上下文桩：方法调用一律 no-op */
function createMockCtx(): CanvasRenderingContext2D {
  const base = { measureText: () => ({ width: 10 }) };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      return () => undefined;
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** TypingEngine 桩：捕获 on 订阅者以便手动发射事件 */
function createStubEngine(): { engine: TypingEngine; emit: (e: TypingEvent) => void } {
  let handler: (e: TypingEvent) => void = () => {};
  const engine = {
    on: (h: (e: TypingEvent) => void) => {
      handler = h;
      return () => {
        handler = () => {};
      };
    },
  } as unknown as TypingEngine;
  return { engine, emit: (e) => handler(e) };
}

describe('GameEngine 基类', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    canvas.id = 'test-canvas';
    canvas.width = 800;
    canvas.height = 500;
    (canvas as unknown as { getContext: () => unknown }).getContext = () => createMockCtx();
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const makeGame = () => new TestGame('test-canvas', { onUpdate: () => {}, onGameOver: () => {} });

  it('start 进入运行并倒计时 3，倒计时期间忽略字符输入', () => {
    const game = makeGame();
    game.start();
    expect(game.isRunning()).toBe(true);
    game.handleChar('a');
    expect(game.chars).toEqual([]);
  });

  it('倒计时结束后接受输入并路由到 onChar', () => {
    const game = makeGame();
    game.start();
    vi.advanceTimersByTime(3000);
    game.handleChar('a');
    game.handleChar('b');
    expect(game.chars).toEqual(['a', 'b']);
  });

  it('pause 阻断输入、再次 pause 恢复输入', () => {
    const game = makeGame();
    game.start();
    vi.advanceTimersByTime(3000);
    game.pause();
    game.handleChar('x');
    expect(game.chars).toEqual([]);
    game.pause();
    game.handleChar('y');
    expect(game.chars).toEqual(['y']);
  });

  it('reset 回到空闲且不再接受输入', () => {
    const game = makeGame();
    game.start();
    vi.advanceTimersByTime(3000);
    game.reset();
    expect(game.isRunning()).toBe(false);
    game.handleChar('z');
    expect(game.chars).toEqual([]);
  });

  it('attachInput 将 char/backspace/submit/escape 路由到对应处理', () => {
    const game = makeGame();
    const stub = createStubEngine();
    game.attachInput(stub.engine);
    game.start();
    vi.advanceTimersByTime(3000);

    stub.emit({ type: 'char', char: 'k' });
    stub.emit({ type: 'backspace' });
    stub.emit({ type: 'submit' });
    expect(game.chars).toEqual(['k']);
    expect(game.backspaces).toBe(1);
    expect(game.submits).toBe(1);

    stub.emit({ type: 'escape' });
    expect(game.isRunning()).toBe(false);
  });

  it('gameOver 停止运行并回调 onGameOver 携带分数', () => {
    let overScore = -1;
    const game = new TestGame('test-canvas', {
      onUpdate: () => {},
      onGameOver: (score: number) => {
        overScore = score;
      },
    });
    game.start();
    vi.advanceTimersByTime(3000);
    game.handleChar('a'); // hits=1，分数仍为 0（TestGame 不加分）
    game.triggerGameOver();
    expect(game.isRunning()).toBe(false);
    expect(overScore).toBe(0);
  });
});
