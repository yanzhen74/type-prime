import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrainPanel } from './train-panel.js';
import { THEMES, alpha, type CanvasPalette } from '../render/theme.js';
import type { TypingEngine } from '../core/input.js';
import type { VocabularyBank, WordQueryOptions } from '../vocab/vocabulary.js';
import type { UserProgress } from '../core/storage.js';
import type { TypingEvent, WordEntry } from '../core/types.js';

/**
 * 构建 TrainPanel 所需的最小 DOM fixture（含 cacheDom 中 requireEl 的全部必需元素）。
 * 刻意不包含 #keyboard-ref canvas：jsdom 未实现 2D 上下文，缺省可让 MiniKeyboardCanvas
 * 走 null 分支安全降级。#panel-train 须带 .active，否则 handleTypingEvent 直接返回。
 */
function mountFixture(): void {
  document.body.innerHTML = `
    <section id="panel-train" class="panel active">
      <div class="train-tabs">
        <button class="train-tab-btn active" data-train-tab="key-drill"></button>
        <button class="train-tab-btn" data-train-tab="word"></button>
        <button class="train-tab-btn" data-train-tab="article"></button>
        <button class="train-tab-btn" data-train-tab="stats"></button>
      </div>
      <div id="train-main">
        <div id="train-level-select"><select id="level-selector"></select></div>
        <div id="train-phase-select"><span id="phase-indicator"></span></div>
        <div id="train-word-select" style="display:none">
          <div id="word-category-list"></div>
          <select id="word-difficulty-select">
            <option value="all"></option>
            <option value="easy"></option>
            <option value="medium"></option>
            <option value="hard"></option>
          </select>
        </div>
        <div id="train-article-input" style="display:none">
          <textarea id="article-textarea"></textarea>
          <button id="article-load-btn"></button>
          <select id="article-select"></select>
          <button id="article-random-btn"></button>
          <button id="article-seq-btn"></button>
        </div>
        <span id="train-status-badge"></span>
        <div id="text-target"></div>
        <div id="text-input"></div>
        <span id="stat-wpm"></span><span id="stat-cpm"></span>
        <span id="stat-accuracy"></span><span id="stat-progress"></span>
        <button id="train-start-btn"></button>
        <button id="train-reset-btn"></button>
        <button id="train-next-btn" style="display:none"></button>
        <div class="keyboard-ref-bar">
          <span class="keyboard-ref-title">键盘参考</span>
          <button id="train-motion-btn" class="btn keyboard-motion-btn" aria-pressed="true">
            <span id="train-motion-label">动画：开</span>
          </button>
        </div>
        <div id="mini-hands-diagram"></div>
        <div id="mini-finger-hint"></div>
      </div>
      <div id="train-stats-view" style="display:none">
        <div id="stats-empty-banner" style="display:none"></div>
        <div id="stats-summary"></div>
        <div id="heatmap-keyboard"></div>
        <button id="stats-drill-weak-btn" disabled></button>
        <span id="stats-weak-summary"></span>
        <div id="stats-words-table-wrap"><table><tbody id="stats-words-body"></tbody></table></div>
        <div id="stats-words-empty" style="display:none"></div>
        <button id="stats-review-words-btn" disabled></button>
        <div id="stats-sessions"></div>
        <div id="stats-sessions-empty" style="display:none"></div>
      </div>
      <div id="train-result-modal" style="display:none">
        <h3></h3>
        <div id="result-stats"></div>
        <div id="result-errors"></div>
        <button id="result-close-btn"></button>
      </div>
    </section>
  `;
}

/** canvas 探针：记录一帧帧绘制写入的版面色与几何变换，用于断言主题与动画 */
interface CanvasProbe {
  colors: string[];
  translates: [number, number][];
  scales: [number, number][];
  /** 静态层 blit 次数（分层渲染命中观察口） */
  blits: number;
}

/**
 * 补上 fixture 刻意省略的 #keyboard-ref canvas，并接管其 2D 上下文。
 * jsdom 不实现 canvas 绘制，这里用 Proxy 把 fillStyle/strokeStyle/shadowColor
 * 与 translate/scale 的写入录下来，动画与主题断言全部基于这些真实绘制调用。
 */
function mountKeyboardCanvas(): CanvasProbe {
  const colors: string[] = [];
  const translates: [number, number][] = [];
  const scales: [number, number][] = [];
  let blits = 0;
  const base = {
    measureText: () => ({ width: 10 }),
    drawImage: () => {
      blits += 1;
    },
    translate: (x: number, y: number) => {
      translates.push([x, y]);
    },
    scale: (x: number, y: number) => {
      scales.push([x, y]);
    },
  };
  const ctx = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      return () => undefined;
    },
    set(_target, prop, value) {
      if (
        (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') &&
        typeof value === 'string'
      ) {
        colors.push(value);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  const canvas = document.createElement('canvas');
  canvas.id = 'keyboard-ref';
  (canvas as unknown as { getContext: () => unknown }).getContext = () => ctx;
  document.body.appendChild(canvas);
  return {
    colors,
    translates,
    scales,
    get blits() {
      return blits;
    },
  };
}

/** 词库桩：单词模式返回固定两词，目标文本恒为 "ab cd"，便于断言 */
function makeVocabStub(): VocabularyBank {
  const words: WordEntry[] = [
    { id: 'w1', text: 'ab', difficulty: 1, category: 'daily' },
    { id: 'w2', text: 'cd', difficulty: 1, category: 'daily' },
  ];
  return {
    getWords: () => words,
    getWordById: (id: string) => words.find((w) => w.id === id),
    getCategories: () => [],
  } as unknown as VocabularyBank;
}

function makeProgressStub(): UserProgress {
  return {
    recordSession: () => {},
    recordKeyResult: () => {},
    recordWordResult: () => {},
    getKeyStats: () => ({}),
    getWordStats: () => ({}),
    getCurrentUser: () => undefined,
  } as unknown as UserProgress;
}

interface Harness {
  feed: (event: TypingEvent) => void;
  targetSpans: () => Element[];
  inputSpans: () => Element[];
  resultErrors: HTMLElement;
}

/** 挂载 TrainPanel，切到单词模式并开始练习，返回驱动输入的句柄 */
function setup(): Harness {
  let callback: ((e: TypingEvent) => void) | null = null;
  const typingStub = {
    on: (cb: (e: TypingEvent) => void) => {
      callback = cb;
      return () => {};
    },
    focus: () => {},
  } as unknown as TypingEngine;

  new TrainPanel({
    typingEngine: typingStub,
    keyboard: null,
    vocabulary: makeVocabStub(),
    progress: makeProgressStub(),
    currentUser: () => 'Tester',
  });

  // 切换到单词模式（触发 preparePreview 生成 "ab cd"），再开始练习
  (document.querySelector('[data-train-tab="word"]') as HTMLElement).click();
  (document.getElementById('train-start-btn') as HTMLElement).click();

  return {
    feed: (event) => callback?.(event),
    targetSpans: () => [...document.querySelectorAll('#text-target .char')],
    // 排除末尾光标 span（class 为 cursor，不含 char）
    inputSpans: () => [...document.querySelectorAll('#text-input .char')],
    resultErrors: document.getElementById('result-errors') as HTMLElement,
  };
}

const char = (c: string): TypingEvent => ({ type: 'char', char: c });

/**
 * 分层渲染接线：接管 document.createElement('canvas') 让离屏画布拿到真实记录 ctx，
 * 从而在 jsdom 里也能走离屏缓存路径（默认 jsdom 离屏不可用会降级直绘）。
 * 本 describe 必须最先跑：离屏支持探针是模块级一次性缓存。
 */
describe('TrainPanel 缩略键盘分层渲染', () => {
  let offFills = 0;
  let createSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    localStorage.clear();
    mountFixture();
    offFills = 0;
    const offBase = {
      fillRect: () => {
        offFills += 1;
      },
      fill: () => {
        offFills += 1;
      },
      measureText: () => ({ width: 10 }),
    };
    const offCtx = new Proxy(offBase, {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        return () => undefined;
      },
      set() {
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    const realCreate = document.createElement.bind(document);
    createSpy = vi.spyOn(document, 'createElement');
    createSpy.mockImplementation(((tag: string, options?: unknown) => {
      const el = realCreate(tag as keyof HTMLElementTagNameMap, options as ElementCreationOptions);
      if (tag === 'canvas') {
        (el as unknown as { getContext: () => unknown }).getContext = () => offCtx;
      }
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    createSpy?.mockRestore();
    createSpy = null;
    currentAnim?.panel.destroy();
    currentAnim?.raf.restore();
    currentAnim = null;
    document.body.replaceChildren();
  });

  it('离屏可用：板面与键座只绘一次，呼吸动画帧只 blit 静态层', () => {
    const a = mountAnimHarness();
    const staticFills = offFills;
    expect(staticFills).toBeGreaterThan(0);
    const blitsBefore = a.probe.blits;

    a.advance(240);

    // 静态层（板面 1 次 fillRect + 每键座 1 次 fill）不再重绘
    expect(offFills).toBe(staticFills);
    expect(a.probe.blits).toBeGreaterThan(blitsBefore);
  });

  it('redraw 作废静态缓存：下一帧重绘离屏一次后继续命中', () => {
    const a = mountAnimHarness();
    const staticFills = offFills;

    a.panel.redraw();
    expect(offFills).toBe(staticFills * 2);

    const afterRedraw = offFills;
    a.advance(160);
    expect(offFills).toBe(afterRedraw);
  });
});

describe('TrainPanel 错误输入反馈渲染', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  it('原行保持干净参照（不标红），输入行回显真实敲入字符且错误位变红（.incorrect）', () => {
    const h = setup();
    h.feed(char('a')); // 正确
    h.feed(char('x')); // 错误，应为 b

    const target = h.targetSpans();
    const input = h.inputSpans();

    // 原行：干净参照，错误位不再标红，仍显示标准（正确）字符
    expect(target[1].classList.contains('error')).toBe(false);
    expect(target[1].textContent).toBe('b');
    expect(target[0].classList.contains('error')).toBe(false);

    // 输入行：回显用户真实敲入字符，错误位 .incorrect（红色）
    expect(input[1].classList.contains('incorrect')).toBe(true);
    expect(input[1].textContent).toBe('x');
    expect(input[0].classList.contains('correct')).toBe(true);
  });

  it('错误空格渲染为可见符号 ␣（红底药丸内空白不可辨）', () => {
    const h = setup();
    h.feed(char(' ')); // 首位应为 a，却敲了空格

    const input = h.inputSpans();
    expect(input[0].classList.contains('incorrect')).toBe(true);
    expect(input[0].textContent).toBe('␣');
  });

  it('错误瞬间对输入 span 施加一次性 shake 动画类', () => {
    const h = setup();
    h.feed(char('a'));
    h.feed(char('x')); // 错误 -> 该位应带 shake

    const input = h.inputSpans();
    expect(input[1].classList.contains('shake')).toBe(true);
    expect(input[0].classList.contains('shake')).toBe(false);
  });

  it('完成后回退再输入不抛异常（光标已摘除时输入行仍能追加 span）', () => {
    const h = setup();
    for (const c of ['a', 'b', ' ', 'c', 'd']) {
      h.feed(char(c));
    }
    h.feed({ type: 'backspace' });
    expect(() => h.feed(char('d'))).not.toThrow();

    const input = h.inputSpans();
    expect(input.length).toBe(5);
    expect(input[4].textContent).toBe('d');
    expect(input[4].classList.contains('correct')).toBe(true);
  });

  it('文章模式从空态加载文本后，目标行不残留模式提示文案', () => {
    const typingStub = {
      on: () => () => {},
      focus: () => {},
    } as unknown as TypingEngine;
    new TrainPanel({
      typingEngine: typingStub,
      keyboard: null,
      vocabulary: makeVocabStub(),
      progress: makeProgressStub(),
      currentUser: () => 'Tester',
    });
    (document.querySelector('[data-train-tab="article"]') as HTMLElement).click();
    const target = document.getElementById('text-target') as HTMLElement;
    expect(target.textContent).toContain('选择一篇预装文章');

    const ta = document.getElementById('article-textarea') as HTMLTextAreaElement;
    ta.value = 'ab cd';
    (document.getElementById('article-load-btn') as HTMLElement).click();
    // 空格在目标行渲染为不间断空格（displayChar），其余字符原样
    expect(target.textContent).toBe('ab\u00A0cd');
  });

  it('结果弹窗错误明细以「应为 Y，你敲了 X」配对呈现', () => {
    const h = setup();
    // 目标 "ab cd"：a 正确、x 错（应为 b）、空格正确、c 正确、d 正确 -> 完成
    h.feed(char('a'));
    h.feed(char('x'));
    h.feed(char(' '));
    h.feed(char('c'));
    h.feed(char('d'));

    const exp = h.resultErrors.querySelector('.err-exp');
    const act = h.resultErrors.querySelector('.err-act');
    expect(exp?.textContent).toBe('b');
    expect(act?.textContent).toBe('x');
    expect(h.resultErrors.textContent).toContain('应为');
    expect(h.resultErrors.textContent).toContain('你敲了');
  });
});

/** 记录 getWords 查询参数的词库桩，用于断言分类/难度过滤生效 */
function makeRecordingVocabStub(): { bank: VocabularyBank; calls: WordQueryOptions[] } {
  const calls: WordQueryOptions[] = [];
  const words: WordEntry[] = [
    { id: 'daily-001', text: 'apple', difficulty: 1, category: 'daily' },
    { id: 'cet4-0001', text: 'abandon', difficulty: 3, category: 'cet4' },
  ];
  const bank = {
    getWords: (options: WordQueryOptions = {}) => {
      calls.push(options);
      return words;
    },
    getWordById: (id: string) => words.find((w) => w.id === id),
    getCategories: () => [
      { id: 'daily', name: '日常英语', language: 'en' },
      { id: 'cet4', name: '大学英语四级', language: 'en' },
    ],
  } as unknown as VocabularyBank;
  return { bank, calls };
}

describe('TrainPanel 单词练习词库选择', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  function mountWithRecordingVocab(): { calls: WordQueryOptions[] } {
    const { bank, calls } = makeRecordingVocabStub();
    const typingStub = {
      on: () => () => {},
      focus: () => {},
    } as unknown as TypingEngine;
    new TrainPanel({
      typingEngine: typingStub,
      keyboard: null,
      vocabulary: bank,
      progress: makeProgressStub(),
      currentUser: () => 'Tester',
    });
    return { calls };
  }

  const wordTab = () => document.querySelector('[data-train-tab="word"]') as HTMLElement;
  const categoryBoxes = () =>
    [
      ...document.querySelectorAll('#word-category-list input[type="checkbox"]'),
    ] as HTMLInputElement[];

  it('单词模式下显示词库选择并按分类渲染勾选框（默认全选）', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const wrap = document.getElementById('train-word-select') as HTMLElement;
    expect(wrap.style.display).not.toBe('none');
    expect(categoryBoxes().length).toBe(2);
    expect(categoryBoxes().every((b) => b.checked)).toBe(true);
    // 默认全选 -> 取词查询带上全部分类
    expect(calls[calls.length - 1].categories).toEqual(['daily', 'cet4']);
  });

  it('取消勾选某分类后以剩余分类重新取词并持久化', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const daily = categoryBoxes().find((b) => b.value === 'daily') as HTMLInputElement;
    daily.click(); // 取消勾选 -> 触发 change

    expect(calls[calls.length - 1].categories).toEqual(['cet4']);
    const saved = JSON.parse(localStorage.getItem('typeprime_word_practice_pref') ?? '{}');
    expect(saved.categories).toEqual(['cet4']);
  });

  it('切换难度范围后以对应 difficulties 重新取词', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const sel = document.getElementById('word-difficulty-select') as HTMLSelectElement;
    sel.value = 'hard';
    sel.dispatchEvent(new Event('change'));

    expect(calls[calls.length - 1].difficulties).toEqual([4, 5]);
  });
});

describe('TrainPanel 缩略键盘主题取色', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function makePanel(getPalette?: () => CanvasPalette): TrainPanel {
    const typingStub = {
      on: () => () => {},
      focus: () => {},
    } as unknown as TypingEngine;
    return new TrainPanel({
      typingEngine: typingStub,
      keyboard: null,
      vocabulary: makeVocabStub(),
      progress: makeProgressStub(),
      currentUser: () => 'Tester',
      getPalette,
    });
  }

  it('注入纸墨白后底色/键帽字/左右手底色均跟随主题', () => {
    const { colors } = mountKeyboardCanvas();
    const panel = makePanel(() => THEMES.paper.canvas);

    expect(colors).toContain(THEMES.paper.canvas.board);
    expect(colors).toContain(THEMES.paper.canvas.ink);
    expect(colors).toContain(THEMES.paper.canvas.handLeft);
    expect(colors).toContain(THEMES.paper.canvas.handRight);
    expect(colors).not.toContain(THEMES.night.canvas.board);
    panel.destroy();
  });

  it('未注入取色函数时回退深空夜', () => {
    const { colors } = mountKeyboardCanvas();
    const panel = makePanel();

    expect(colors).toContain(THEMES.night.canvas.board);
    expect(colors).toContain(THEMES.night.canvas.handLeft);
    panel.destroy();
  });

  it('redraw 用新主题重绘，不重建实例也不丢提示状态', () => {
    const { colors } = mountKeyboardCanvas();
    let current: CanvasPalette = THEMES.night.canvas;
    const panel = makePanel(() => current);

    colors.length = 0;
    current = THEMES.phosphor.canvas;
    panel.redraw();

    expect(colors).toContain(THEMES.phosphor.canvas.board);
    expect(colors).toContain(THEMES.phosphor.canvas.handRight);
    expect(colors).not.toContain(THEMES.night.canvas.board);
    panel.destroy();
  });
});

// ---------------------------------------------------------------------------
// 键盘动画：帧循环起停 / 降级开关 / 手指演示
// ---------------------------------------------------------------------------

interface RafStub {
  /** 已请求但尚未执行的帧数：为 0 即证明循环已停 */
  pendingCount: () => number;
  /** 以指定时间戳执行当前排队的所有帧 */
  flush: (now: number) => void;
  restore: () => void;
}

/** 把手动帧队列换到 window 上，让测试精确控制每一帧的时间戳 */
function installRafStub(): RafStub {
  const queue = new Map<number, FrameRequestCallback>();
  const win = window as unknown as Record<string, unknown>;
  const realRaf = win.requestAnimationFrame;
  const realCancel = win.cancelAnimationFrame;
  let nextId = 1;
  win.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  win.cancelAnimationFrame = (id: number) => {
    queue.delete(id);
  };
  return {
    pendingCount: () => queue.size,
    flush: (now: number) => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) {
        cb(now);
      }
    },
    restore: () => {
      win.requestAnimationFrame = realRaf;
      win.cancelAnimationFrame = realCancel;
    },
  };
}

/** 把探针录到的 translate 序列按「每帧条目数」切回一帧一帧 */
function splitFrames(probe: CanvasProbe, perFrame: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i + perFrame <= probe.translates.length; i += perFrame) {
    out.push(probe.translates.slice(i, i + perFrame));
  }
  return out;
}

/** 取一批颜色里强调色半透明叠加的最大不透明度（层级/引导/按下共用强调色） */
function maxAccentAlpha(colors: string[]): number {
  const prefix = alpha(THEMES.night.canvas.accent, 1).slice(0, -2);
  let max = 0;
  for (const color of colors) {
    if (!color.startsWith(prefix)) {
      continue;
    }
    const value = Number(color.slice(prefix.length, -1));
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
}

interface AnimHarness {
  panel: TrainPanel;
  probe: CanvasProbe;
  raf: RafStub;
  feed: (event: TypingEvent) => void;
  /** 以 ≤16ms 的步长推进合成时钟，与真实 rAF 节奏一致 */
  advance: (ms: number) => void;
  motionBtn: HTMLButtonElement;
  motionLabel: HTMLElement;
  hands: HTMLElement;
}

let currentAnim: AnimHarness | null = null;
let restoreMedia: (() => void) | null = null;

/** 挂载带 canvas 探针与手动帧队列的训练面板，默认进入单词练习（目标 "ab cd"） */
function mountAnimHarness(wordPractice = true): AnimHarness {
  const raf = installRafStub();
  const probe = mountKeyboardCanvas();
  let callback: ((e: TypingEvent) => void) | null = null;
  const typingStub = {
    on: (cb: (e: TypingEvent) => void) => {
      callback = cb;
      return () => {};
    },
    focus: () => {},
  } as unknown as TypingEngine;
  const panel = new TrainPanel({
    typingEngine: typingStub,
    keyboard: null,
    vocabulary: makeVocabStub(),
    progress: makeProgressStub(),
    currentUser: () => 'Tester',
  });
  if (wordPractice) {
    (document.querySelector('[data-train-tab="word"]') as HTMLElement).click();
    (document.getElementById('train-start-btn') as HTMLElement).click();
  }

  let now = 0;
  raf.flush(now); // 首帧：dt 哨兵生效，只把动画时钟对齐到 0
  const harness: AnimHarness = {
    panel,
    probe,
    raf,
    feed: (event) => callback?.(event),
    advance: (ms: number) => {
      let left = ms;
      while (left > 0) {
        const step = Math.min(16, left);
        now += step;
        raf.flush(now);
        left -= step;
      }
    },
    motionBtn: document.getElementById('train-motion-btn') as HTMLButtonElement,
    motionLabel: document.getElementById('train-motion-label') as HTMLElement,
    hands: document.getElementById('mini-hands-diagram') as HTMLElement,
  };
  currentAnim = harness;
  return harness;
}

/** 把系统「减少动态效果」偏好置为命中，并登记还原函数 */
function stubReducedMotionSystem(): void {
  const win = window as unknown as Record<string, unknown>;
  const real = win.matchMedia;
  win.matchMedia = (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  restoreMedia = () => {
    win.matchMedia = real;
  };
}

const leftHand = () => document.querySelector('.mini-hand--left') as HTMLElement;
const rightHand = () => document.querySelector('.mini-hand--right') as HTMLElement;
const savedMotion = () =>
  JSON.parse(localStorage.getItem('typeprime_train_settings') ?? '{}').motion;

describe('TrainPanel 键盘动画', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  afterEach(() => {
    currentAnim?.panel.destroy();
    currentAnim?.raf.restore();
    currentAnim = null;
    restoreMedia?.();
    restoreMedia = null;
    document.body.replaceChildren();
  });

  it('正确击键：键帽下沉收缩后回弹过冲，落定后缩放全部回到 1', () => {
    const a = mountAnimHarness();
    a.probe.scales.length = 0;
    a.feed(char('a'));
    a.advance(224);
    // 下压段收缩到 1 以下，回弹段短暂越过静止位（easeOutBack 过冲）
    expect(a.probe.scales.some(([sx]) => sx < 1)).toBe(true);
    expect(a.probe.scales.some(([sx]) => sx > 1)).toBe(true);

    a.advance(600); // 越过下压 + 回弹 + 涟漪寿命
    a.probe.scales.length = 0;
    a.advance(32); // 落定后的帧：只剩呼吸引导，不再改缩放
    expect(a.probe.scales.length).toBeGreaterThan(0);
    expect(a.probe.scales.every(([sx]) => sx === 1)).toBe(true);
  });

  it('错键：该键水平抖动，位移偏离所有静止键位', () => {
    const a = mountAnimHarness();
    a.feed(char('a'));
    a.advance(500); // 让上一次击键的下压回弹与涟漪完全落定
    const idleX = new Set(a.probe.translates.map(([x]) => x));

    a.probe.translates.length = 0;
    a.feed(char('x')); // 应为 b，却敲了 x
    a.advance(120);
    expect(a.probe.translates.some(([x]) => !idleX.has(x))).toBe(true);
  });

  it('下一键呼吸引导：只有引导键在垂直方向持续浮动，且帧循环不停', () => {
    const a = mountAnimHarness();
    a.probe.translates.length = 0;
    a.advance(16); // 恰好一帧，用来标定每帧的 translate 条目数
    const perFrame = a.probe.translates.length;
    expect(perFrame).toBeGreaterThan(0);

    a.probe.translates.length = 0;
    a.advance(320);
    const frames = splitFrames(a.probe, perFrame);
    expect(frames.length).toBeGreaterThan(2);
    for (let i = 1; i < frames.length; i++) {
      const moved = frames[i].filter((p, j) => p[1] !== frames[i - 1][j][1]).length;
      expect(moved).toBeGreaterThan(0);
      // 只有引导键在动，不是整盘抖动
      expect(moved).toBeLessThan(perFrame / 4);
    }
    expect(a.raf.pendingCount()).toBeGreaterThan(0);
  });

  it('键位练习层级高亮：强调色描边浓度渐入到满值后稳定', () => {
    const a = mountAnimHarness(false);
    a.probe.colors.length = 0;
    a.advance(40);
    const early = maxAccentAlpha(a.probe.colors);

    a.probe.colors.length = 0;
    a.advance(600);
    const late = maxAccentAlpha(a.probe.colors);
    expect(early).toBeLessThan(late);
    expect(late).toBeCloseTo(0.55, 5);
  });

  it('练习完成后引导清空，瞬时通道落定即停止帧循环（空闲不空转）', () => {
    const a = mountAnimHarness();
    for (const c of ['a', 'b', ' ', 'c', 'd']) {
      a.feed(char(c));
    }
    expect(a.raf.pendingCount()).toBeGreaterThan(0);
    a.advance(800);
    expect(a.raf.pendingCount()).toBe(0);
  });

  it('面板切走后停掉帧循环，切回来补帧续跑', () => {
    const a = mountAnimHarness();
    expect(a.raf.pendingCount()).toBeGreaterThan(0);

    a.panel.setPanelVisible(false);
    expect(a.raf.pendingCount()).toBe(0);
    a.advance(200);
    expect(a.raf.pendingCount()).toBe(0);

    a.panel.setPanelVisible(true);
    expect(a.raf.pendingCount()).toBeGreaterThan(0);
  });

  it('destroy 释放帧循环，不留悬挂的 rAF', () => {
    const a = mountAnimHarness();
    a.feed(char('a'));
    expect(a.raf.pendingCount()).toBeGreaterThan(0);
    a.panel.destroy();
    expect(a.raf.pendingCount()).toBe(0);
  });

  it('动画按钮：关闭后文案/aria/持久化同步，键帽不再有任何位移缩放', () => {
    const a = mountAnimHarness();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('true');
    expect(a.motionLabel.textContent).toBe('动画：开');

    a.motionBtn.click();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('false');
    expect(a.motionBtn.classList.contains('is-off')).toBe(true);
    expect(a.motionLabel.textContent).toBe('动画：关');
    expect(savedMotion()).toBe(false);
    expect(a.hands.classList.contains('mini-hands--static')).toBe(true);

    a.probe.scales.length = 0;
    a.feed(char('a'));
    a.advance(200);
    expect(a.probe.scales.length).toBeGreaterThan(0);
    expect(a.probe.scales.every(([sx]) => sx === 1)).toBe(true);
    // 降级模式无呼吸：瞬时色块停留结束后循环即停
    a.advance(400);
    expect(a.raf.pendingCount()).toBe(0);

    a.motionBtn.click();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('true');
    expect(a.hands.classList.contains('mini-hands--static')).toBe(false);
    expect(savedMotion()).toBe(true);
  });

  it('Ctrl+Shift+7 切换键盘动画（用 e.code 判定，避开 Shift 改键值）', () => {
    const a = mountAnimHarness();
    const btn = a.motionBtn;
    const shortcut = () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '&',
          code: 'Digit7',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );

    shortcut();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    shortcut();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('已存储「动画：关」时挂载即为关闭状态', () => {
    localStorage.setItem('typeprime_train_settings', JSON.stringify({ motion: false }));
    const a = mountAnimHarness();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('false');
    expect(a.motionLabel.textContent).toBe('动画：关');
    expect(a.hands.classList.contains('mini-hands--static')).toBe(true);
  });

  it('存储损坏时回退系统偏好，不抛异常', () => {
    localStorage.setItem('typeprime_train_settings', '{不是 JSON');
    const a = mountAnimHarness();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('系统偏好减少动态效果时默认关闭动画', () => {
    stubReducedMotionSystem();
    const a = mountAnimHarness();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('false');
    expect(a.hands.classList.contains('mini-hands--static')).toBe(true);
  });

  it('显式存储优先于系统偏好：用户开了动画则保持开', () => {
    stubReducedMotionSystem();
    localStorage.setItem('typeprime_train_settings', JSON.stringify({ motion: true }));
    const a = mountAnimHarness();
    expect(a.motionBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('正确击键点亮对应手指的下点演示，并把引导手分组底点亮', () => {
    const a = mountAnimHarness();
    a.feed(char('a')); // a -> 左手小指；下一键 b -> 左手食指
    expect(
      leftHand().querySelector('.mini-finger--pinky')?.classList.contains('mini-finger--tap')
    ).toBe(true);
    expect(leftHand().classList.contains('mini-hand--active')).toBe(true);
    expect(rightHand().classList.contains('mini-hand--active')).toBe(false);
    expect(
      leftHand().querySelector('.mini-finger--index')?.classList.contains('mini-finger--hint')
    ).toBe(true);
  });

  it('错键让实际敲下的键对应手指红色抖动，不牵连另一只手', () => {
    const a = mountAnimHarness();
    a.feed(char('a'));
    a.feed(char('x')); // 应为 b，敲了 x -> 左手无名指
    expect(
      leftHand().querySelector('.mini-finger--ring')?.classList.contains('mini-finger--miss')
    ).toBe(true);
    expect(
      rightHand().querySelector('.mini-finger--ring')?.classList.contains('mini-finger--miss')
    ).toBe(false);
    // 前一次正确击键的下点演示不被错键抹掉
    expect(
      leftHand().querySelector('.mini-finger--pinky')?.classList.contains('mini-finger--tap')
    ).toBe(true);
  });
});

describe('TrainPanel 错误分析视图接线', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mountStatsPanel(progressOverride?: Partial<UserProgress>): {
    feed: (event: TypingEvent) => void;
    panel: TrainPanel;
  } {
    let callback: ((e: TypingEvent) => void) | null = null;
    const typingStub = {
      on: (cb: (e: TypingEvent) => void) => {
        callback = cb;
        return () => {};
      },
      focus: () => {},
    } as unknown as TypingEngine;
    const panel = new TrainPanel({
      typingEngine: typingStub,
      keyboard: null,
      vocabulary: makeVocabStub(),
      progress: { ...makeProgressStub(), ...progressOverride } as UserProgress,
      currentUser: () => 'Tester',
    });
    return { feed: (event) => callback?.(event), panel };
  }

  const statsTab = (): HTMLElement =>
    document.querySelector('[data-train-tab="stats"]') as HTMLElement;
  const keyTab = (): HTMLElement =>
    document.querySelector('[data-train-tab="key-drill"]') as HTMLElement;
  const badge = (): HTMLElement => document.getElementById('train-status-badge') as HTMLElement;

  it('点击错误分析子标签隐藏练习区并展示统计视图，切回键位练习恢复', () => {
    mountStatsPanel();
    statsTab().click();
    expect(document.getElementById('train-main')!.style.display).toBe('none');
    expect(document.getElementById('train-stats-view')!.style.display).toBe('');
    expect(statsTab().classList.contains('active')).toBe(true);
    // 热力图键帽由注入的缩略键盘布局构建（48 键）
    expect(document.querySelectorAll('.heat-key').length).toBeGreaterThan(40);

    keyTab().click();
    expect(document.getElementById('train-main')!.style.display).toBe('');
    expect(document.getElementById('train-stats-view')!.style.display).toBe('none');
    expect(keyTab().classList.contains('active')).toBe(true);
  });

  it('Ctrl+Shift+4（e.code Digit4）往返切换错误分析视图', () => {
    mountStatsPanel();
    const press = (): void => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '$',
          code: 'Digit4',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
    };
    press();
    expect(document.getElementById('train-stats-view')!.style.display).toBe('');
    press();
    expect(document.getElementById('train-stats-view')!.style.display).toBe('none');
  });

  it('错误分析展示期间输入门控：Enter/字符不启动练习，Ctrl+↑ 不切层级', () => {
    const { feed, panel } = mountStatsPanel();
    statsTab().click();
    const levelBefore = (document.getElementById('level-selector') as HTMLSelectElement).value;
    feed({ type: 'submit' });
    feed(char('a'));
    expect(badge().classList.contains('idle')).toBe(true);
    panel.cycleLevel(1);
    expect((document.getElementById('level-selector') as HTMLSelectElement).value).toBe(
      levelBefore
    );
  });

  it('startWeakKeyDrill 生成仅含推荐键的序列并直接开始练习，下拉框展示专项选项', () => {
    const { panel } = mountStatsPanel();
    expect(panel.startWeakKeyDrill(['a', 's'])).toBe(true);
    expect(badge().classList.contains('active')).toBe(true);
    const selector = document.getElementById('level-selector') as HTMLSelectElement;
    expect(selector.value).toBe('weak-keys');
    expect(selector.querySelector('option[value="weak-keys"]')!.textContent).toContain(
      '薄弱键位专项'
    );
    const chars = [...document.querySelectorAll('#text-target .char')].map((el) => el.textContent);
    expect(chars.length).toBeGreaterThan(0);
    for (const c of chars) {
      expect(['a', 's', ' ', '\u00a0']).toContain(c);
    }
    // 空键位列表拒绝发起
    expect(panel.startWeakKeyDrill([])).toBe(false);
  });

  it('专项期间选择常规层级后清除临时层级与下拉选项', () => {
    const { panel } = mountStatsPanel();
    panel.startWeakKeyDrill(['a']);
    const selector = document.getElementById('level-selector') as HTMLSelectElement;
    selector.value = 'top-row';
    selector.dispatchEvent(new Event('change'));
    expect(selector.querySelector('option[value="weak-keys"]')).toBeNull();
    expect(selector.value).toBe('top-row');
  });

  it('startReview 从错误分析发起复习时退出统计视图（mode 已是 word 亦生效）', () => {
    const { panel } = mountStatsPanel();
    // 先处于单词模式再进错误分析，覆盖不走 switchMode 的分支
    (document.querySelector('[data-train-tab="word"]') as HTMLElement).click();
    statsTab().click();
    expect(document.getElementById('train-stats-view')!.style.display).toBe('');
    expect(panel.startReview(['w1'])).toBe(true);
    expect(document.getElementById('train-stats-view')!.style.display).toBe('none');
    expect(document.getElementById('train-main')!.style.display).toBe('');
    expect(badge().classList.contains('active')).toBe(true);
    expect(document.getElementById('text-target')!.textContent).toContain('ab');
  });

  it('练习完成时同步累计正确击键（错误率分母），换行不计入', () => {
    const recordKeyResult = vi.fn();
    const { feed } = mountStatsPanel({ recordKeyResult });
    keyTab().click();
    // 切到单词模式：词库桩返回 ab / cd，目标文本 "ab cd"
    (document.querySelector('[data-train-tab="word"]') as HTMLElement).click();
    (document.getElementById('train-start-btn') as HTMLElement).click();
    feed(char('a'));
    feed(char('b'));
    feed(char(' '));
    feed(char('c'));
    feed(char('d'));
    expect(recordKeyResult).toHaveBeenCalledWith('KeyA', true);
    expect(recordKeyResult).toHaveBeenCalledWith('KeyB', true);
    expect(recordKeyResult).toHaveBeenCalledWith('Space', true);
    expect(recordKeyResult).toHaveBeenCalledWith('KeyC', true);
    expect(recordKeyResult).toHaveBeenCalledWith('KeyD', true);
    // 全对练习不产生错误记录
    expect(recordKeyResult.mock.calls.some(([, ok]) => ok === false)).toBe(false);
  });
});
