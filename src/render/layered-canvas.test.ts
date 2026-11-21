import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LayeredCanvas } from './layered-canvas.js';
import { GameEngine } from '../games/game-engine.js';
import type { GameBaseState } from '../core/types.js';

/** 记录绘制调用的假 2D 上下文：分层底座的缓存命中与否全靠调用序列断言 */
function makeRecorder() {
  const calls: string[] = [];
  const ctx = {
    clearRect: (...a: number[]) => calls.push(`clearRect:${a.join(',')}`),
    fillRect: (...a: number[]) => calls.push(`fillRect:${a.join(',')}`),
    stroke: () => calls.push('stroke'),
    drawImage: (img: unknown, x: number, y: number) =>
      calls.push(`drawImage:${(img as { tag: string }).tag},${x},${y}`),
  };
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}

function fakeCanvas(tag: string, withCtx = true) {
  const rec = makeRecorder();
  const canvas = {
    tag,
    width: 100,
    height: 50,
    getContext: () => (withCtx ? rec.ctx : null),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, rec };
}

/** 静态层内容：一次填充 + 一次描边，便于数「重绘了几次」 */
const paintStatic = (ctx: CanvasRenderingContext2D): void => {
  ctx.fillRect(0, 0, 100, 50);
  ctx.stroke();
};

describe('LayeredCanvas 静态层缓存', () => {
  it('首帧重绘静态层到离屏并 blit 到主画布', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off');
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });
    const key = { theme: 'night' };

    const ctx = layers.beginFrame(key, paintStatic);

    expect(ctx).toBe(main.rec.ctx);
    expect(layers.layered).toBe(true);
    expect(layers.staticPaints).toBe(1);
    expect(layers.blits).toBe(1);
    expect(off.rec.calls).toEqual(['fillRect:0,0,100,50', 'stroke']);
    expect(main.rec.calls).toEqual(['clearRect:0,0,100,50', 'drawImage:off,0,0']);
  });

  it('同指纹同尺寸的后续帧只 blit，不重绘静态层', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off');
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });
    const key = { theme: 'night' };

    layers.beginFrame(key, paintStatic);
    layers.beginFrame(key, paintStatic);
    layers.beginFrame(key, paintStatic);

    expect(layers.staticPaints).toBe(1);
    expect(layers.blits).toBe(3);
    expect(off.rec.calls).toHaveLength(2);
    // 主画布每帧只清屏 + blit，静态内容不再逐帧描
    expect(main.rec.calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(0);
    expect(main.rec.calls.filter((c) => c.startsWith('clearRect'))).toHaveLength(3);
    expect(main.rec.calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(3);
  });

  it('指纹变化（换主题）触发静态层重绘', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off');
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });

    layers.beginFrame({ theme: 'night' }, paintStatic);
    layers.beginFrame({ theme: 'paper' }, paintStatic);

    expect(layers.staticPaints).toBe(2);
    expect(layers.blits).toBe(2);
  });

  it('主画布尺寸变化触发重绘且离屏尺寸同步', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off');
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });
    const key = {};

    layers.beginFrame(key, paintStatic);
    main.canvas.width = 200;
    main.canvas.height = 80;
    layers.beginFrame(key, paintStatic);

    expect(layers.staticPaints).toBe(2);
    expect(off.canvas.width).toBe(200);
    expect(off.canvas.height).toBe(80);
    expect(main.rec.calls).toContain('clearRect:0,0,200,80');
  });

  it('invalidate 显式作废后下一帧重绘', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off');
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });
    const key = {};

    layers.beginFrame(key, paintStatic);
    layers.beginFrame(key, paintStatic);
    layers.invalidate();
    layers.beginFrame(key, paintStatic);

    expect(layers.staticPaints).toBe(2);
    expect(layers.blits).toBe(3);
  });

  it('离屏不可用时降级为逐帧直绘静态层，视觉路径与分层前一致', () => {
    const main = fakeCanvas('main');
    const off = fakeCanvas('off', false);
    const layers = new LayeredCanvas(main.canvas, { createCanvas: () => off.canvas });
    const key = {};

    expect(layers.layered).toBe(false);
    layers.beginFrame(key, paintStatic);
    layers.beginFrame(key, paintStatic);

    expect(layers.blits).toBe(0);
    expect(layers.staticPaints).toBe(2);
    expect(off.rec.calls).toHaveLength(0);
    expect(main.rec.calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(2);
    expect(main.rec.calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(0);
  });

  it('主画布拿不到 2D 上下文时构造即抛错', () => {
    const main = fakeCanvas('main', false);
    expect(() => new LayeredCanvas(main.canvas)).toThrow('Canvas 2D context not supported');
  });
});

/** 最小游戏子类：draw 走基类 beginFrame，暴露分层计数供断言 */
class LayerProbeGame extends GameEngine<GameBaseState> {
  protected createState(): GameBaseState {
    return this.createBaseState();
  }
  protected update(): void {}
  protected onChar(): void {}
  protected draw(): void {
    const ctx = this.beginFrame((c) => {
      c.fillRect(0, 0, 4, 4);
    });
    ctx.stroke();
  }
  paint(): void {
    this.draw();
  }
  stats(): { paints: number; blits: number } {
    return { paints: this.layers.staticPaints, blits: this.layers.blits };
  }
}

describe('GameEngine 分层接线', () => {
  let createSpy: ReturnType<typeof vi.spyOn> | null = null;
  let offRec: ReturnType<typeof makeRecorder>;
  let mainRec: ReturnType<typeof makeRecorder>;

  beforeEach(() => {
    offRec = makeRecorder();
    mainRec = makeRecorder();
    document.body.innerHTML = '<canvas id="layer-game"></canvas>';
    const mainCanvas = document.getElementById('layer-game') as HTMLCanvasElement;
    (mainCanvas as unknown as { getContext: () => unknown }).getContext = () => mainRec.ctx;
    const realCreate = document.createElement.bind(document);
    createSpy = vi.spyOn(document, 'createElement');
    createSpy.mockImplementation(((tag: string, options?: unknown) => {
      const el = realCreate(tag as keyof HTMLElementTagNameMap, options as ElementCreationOptions);
      if (tag === 'canvas') {
        (el as unknown as { getContext: () => unknown }).getContext = () => offRec.ctx;
      }
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    createSpy?.mockRestore();
    createSpy = null;
    document.body.replaceChildren();
  });

  function mountGame(getPalette: () => unknown): LayerProbeGame {
    return new LayerProbeGame(
      'layer-game',
      { onUpdate: () => {}, onGameOver: () => {} },
      { getPalette: getPalette as () => never }
    );
  }

  it('beginFrame 以版面色为指纹：同主题多帧只绘一次静态层', () => {
    const pal = { theme: 'night' };
    const game = mountGame(() => pal);

    game.paint();
    game.paint();
    game.paint();

    expect(game.stats()).toEqual({ paints: 1, blits: 3 });
    expect(offRec.calls).toEqual(['fillRect:0,0,4,4']);
    expect(mainRec.calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(3);
    // 动态 pass 仍每帧画在主画布上
    expect(mainRec.calls.filter((c) => c === 'stroke')).toHaveLength(3);
  });

  it('换主题（指纹变化）与 redraw 都会重绘静态层', () => {
    let pal: unknown = { theme: 'night' };
    const game = mountGame(() => pal);

    game.paint();
    pal = { theme: 'paper' };
    game.paint();
    expect(game.stats().paints).toBe(2);

    game.redraw();
    expect(game.stats().paints).toBe(3);
    expect(game.stats().blits).toBe(3);
  });
});
