/**
 * Canvas 分层渲染底座（任务 5 第五步）。
 *
 * 把每帧不变的内容（底色 / 网格 / 键座）画进离屏静态层缓存，主画布每帧只做
 * 「清屏 → blit 静态层 → 有序动态 passes（实体 → 粒子 → HUD/遮罩）」，
 * 避免每帧重复描几十条网格线与几十个键座。
 *
 * 缓存失效条件：invalidate() 显式作废、静态内容指纹 key 变化（如换主题后的
 * 版面色对象）、主画布尺寸变化。三者任一命中才重绘离屏，其余帧直接 drawImage。
 *
 * 降级：离屏画布拿不到 2D 上下文（jsdom / 不支持的环境）时退化为「每帧直接在
 * 主 ctx 画静态层」，视觉与分层前完全一致，保证单测探针与老旧环境可用。
 */

/** 静态层绘制函数：只画每帧不变的内容，不得依赖主 ctx 的遗留状态 */
export type StaticPainter = (ctx: CanvasRenderingContext2D) => void;

export interface LayeredCanvasOptions {
  /** 离屏画布工厂（单测注入假画布；默认 document.createElement） */
  createCanvas?: () => HTMLCanvasElement;
}

/** 环境是否支持离屏 2D：只探针一次，避免 jsdom 每次 getContext 都报 not-implemented */
let offscreenSupported: boolean | null = null;

function newOffscreen(): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  if (offscreenSupported === null) {
    offscreenSupported = canvas.getContext('2d') !== null;
  }
  return offscreenSupported ? canvas : null;
}

export class LayeredCanvas {
  /** 主画布上下文：动态 passes 直接用它绘制 */
  readonly ctx: CanvasRenderingContext2D;

  private readonly canvas: HTMLCanvasElement;
  private readonly cache: HTMLCanvasElement | null;
  private readonly cacheCtx: CanvasRenderingContext2D | null;
  private dirty = true;
  private cachedKey: unknown;
  private cachedW = 0;
  private cachedH = 0;

  /** 静态层实际重绘次数（缓存命中观察口，单测与浏览器探针用） */
  staticPaints = 0;
  /** 静态层 blit 次数（等于开帧次数，离屏可用时） */
  blits = 0;

  constructor(canvas: HTMLCanvasElement, options: LayeredCanvasOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    const off = options.createCanvas ? options.createCanvas() : newOffscreen();
    this.cacheCtx = off ? off.getContext('2d') : null;
    this.cache = this.cacheCtx ? off : null;
  }

  /** 是否走离屏分层（false 表示降级为逐帧直绘静态层） */
  get layered(): boolean {
    return this.cache !== null;
  }

  /** 外部变更（主题切换 / 布局重排）时作废静态缓存 */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * 开一帧：清主画布 → 就绪静态层（缓存命中 blit，否则重绘离屏）→ 返回主 ctx。
   * key 为静态内容指纹：传版面色对象引用即可在换主题时自动失效。
   */
  beginFrame(key: unknown, paintStatic: StaticPainter): CanvasRenderingContext2D {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cache = this.cache;
    const cacheCtx = this.cacheCtx;
    if (!cache || !cacheCtx) {
      // 降级：无离屏上下文时静态层直接画在主画布上
      paintStatic(ctx);
      this.staticPaints += 1;
      return ctx;
    }

    if (this.dirty || this.cachedKey !== key || this.cachedW !== w || this.cachedH !== h) {
      // 重置离屏尺寸顺带清掉旧内容与变换状态
      cache.width = w;
      cache.height = h;
      paintStatic(cacheCtx);
      this.staticPaints += 1;
      this.dirty = false;
      this.cachedKey = key;
      this.cachedW = w;
      this.cachedH = h;
    }
    ctx.drawImage(cache, 0, 0);
    this.blits += 1;
    return ctx;
  }
}
