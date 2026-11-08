import type {
  Difficulty,
  DrillPhase,
  Finger,
  PracticeMode,
  TrainProgress,
  TrainingLevel,
  TrainingSession,
  TypingEvent,
  WordEntry,
} from './types.js';
import { TrainEngine, TRAINING_LEVELS, DRILL_PHASES } from './train-engine.js';
import {
  ARTICLE_DIFFICULTIES,
  PRESET_ARTICLES,
  nextPresetArticle,
  randomPresetArticle,
} from './articles.js';
import type { TypingEngine } from './input.js';
import type { KeyboardRenderer } from './keyboard.js';
import type { VocabularyBank } from './vocabulary.js';
import type { UserProgress } from './storage.js';
import type { ReviewScheduler } from './review.js';

/** 单词练习每次取词数量 */
const WORD_COUNT = 20;

/** 单词练习词库选择偏好的 localStorage 键 */
const WORD_PREF_KEY = 'typeprime_word_practice_pref';

/** 单词练习取词偏好：分类多选 + 难度范围 */
interface WordPracticePref {
  /** 勾选的分类 id（空数组表示不过滤，取全部词库） */
  categories: string[];
  /** 难度范围：all / easy(1-2) / medium(3) / hard(4-5) */
  difficulty: string;
}

/** 键盘参考区按键按下的反馈时长（毫秒） */
const MINI_PRESS_MS = 80;

/** 键盘参考区错误按键的红色闪烁时长（毫秒，长于普通按下以强调错误） */
const MINI_ERROR_MS = 320;

// ---------------------------------------------------------------------------
// 字符 -> KeyboardEvent.code 映射
// ---------------------------------------------------------------------------

/** 基础符号字符到 KeyboardEvent.code 的映射（含 Shift 组合符号） */
const CHAR_CODE_MAP: Record<string, string> = {
  ' ': 'Space',
  '`': 'Backquote',
  '~': 'Backquote',
  '1': 'Digit1',
  '!': 'Digit1',
  '2': 'Digit2',
  '@': 'Digit2',
  '3': 'Digit3',
  '#': 'Digit3',
  '4': 'Digit4',
  $: 'Digit4',
  '5': 'Digit5',
  '%': 'Digit5',
  '6': 'Digit6',
  '^': 'Digit6',
  '7': 'Digit7',
  '&': 'Digit7',
  '8': 'Digit8',
  '*': 'Digit8',
  '9': 'Digit9',
  '(': 'Digit9',
  '0': 'Digit0',
  ')': 'Digit0',
  '-': 'Minus',
  _: 'Minus',
  '=': 'Equal',
  '+': 'Equal',
  '[': 'BracketLeft',
  '{': 'BracketLeft',
  ']': 'BracketRight',
  '}': 'BracketRight',
  '\\': 'Backslash',
  '|': 'Backslash',
  ';': 'Semicolon',
  ':': 'Semicolon',
  "'": 'Quote',
  '"': 'Quote',
  ',': 'Comma',
  '<': 'Comma',
  '.': 'Period',
  '>': 'Period',
  '/': 'Slash',
  '?': 'Slash',
};

/**
 * 将单个字符转换为 KeyboardEvent.code 格式（与 keyboard.ts 的键位布局一致）。
 *
 * - 字母（大小写）-> `KeyA` / `KeyB` ...
 * - 数字 -> `Digit1` / `Digit2` ...
 * - 符号与 Shift 组合 -> `Semicolon` / `BracketLeft` ...
 * - 无法识别的字符返回空字符串。
 */
export function charToCode(char: string): string {
  if (char.length !== 1) {
    return '';
  }
  const lower = char.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    return `Key${lower.toUpperCase()}`;
  }
  if (char >= '0' && char <= '9') {
    return `Digit${char}`;
  }
  return CHAR_CODE_MAP[char] ?? '';
}

/** 统计错误键位时使用的键名：优先 code，无法映射时退回原字符 */
function mistakeKeyOf(char: string): string {
  return charToCode(char) || char;
}

/**
 * 将字符转为适合行内展示的形式：
 * - 空格用不换行空格，避免连续空格塌缩
 * - 换行符原样保留（由 .char.newline 配合 white-space: pre-wrap 渲染为换行）
 */
function displayChar(char: string): string {
  return char === ' ' ? '\u00A0' : char;
}

/** 统计需要用户实际输入的字符数（排除自动跳过的换行符，与 TrainEngine 统计口径一致） */
function countTypeable(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch !== '\n') {
      count++;
    }
  }
  return count;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** 将毫秒耗时格式化为「x.x 秒」或「x 分 x 秒」 */
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)} 秒`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} 分 ${seconds} 秒`;
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`TrainPanel: 未找到必需的 DOM 元素 #${id}`);
  }
  return el as T;
}

// ---------------------------------------------------------------------------
// 键盘参考区（canvas 缩略键盘）
// ---------------------------------------------------------------------------

type Hand = 'left' | 'right';

interface MiniKey {
  label: string;
  code: string;
  finger: Finger;
  hand: Hand;
  width?: number;
}

type MiniKeySeed = Omit<MiniKey, 'hand'>;

const FINGER_COLORS: Record<Finger, string> = {
  pinky: '#f472b6',
  ring: '#a78bfa',
  middle: '#60a5fa',
  index: '#34d399',
  thumb: '#fbbf24',
  unknown: '#94a3b8',
};

/** 左右手底色（与 keyboard.ts CSS 保持一致） */
const HAND_FILL: Record<Hand, string> = {
  left: '#17324f',
  right: '#3d2340',
};

/** 手指名称映射（用于提示文字） */
const FINGER_NAMES: Record<Finger, string> = {
  pinky: '小指',
  ring: '无名指',
  middle: '中指',
  index: '食指',
  thumb: '拇指',
  unknown: '未知',
};

/** 与 keyboard.ts 键位布局一致的缩略键盘行种子数据 */
const MINI_ROW_SEEDS: MiniKeySeed[][] = [
  [
    { label: '`', code: 'Backquote', finger: 'pinky' },
    { label: '1', code: 'Digit1', finger: 'pinky' },
    { label: '2', code: 'Digit2', finger: 'ring' },
    { label: '3', code: 'Digit3', finger: 'middle' },
    { label: '4', code: 'Digit4', finger: 'index' },
    { label: '5', code: 'Digit5', finger: 'index' },
    { label: '6', code: 'Digit6', finger: 'index' },
    { label: '7', code: 'Digit7', finger: 'index' },
    { label: '8', code: 'Digit8', finger: 'middle' },
    { label: '9', code: 'Digit9', finger: 'ring' },
    { label: '0', code: 'Digit0', finger: 'pinky' },
    { label: '-', code: 'Minus', finger: 'pinky' },
    { label: '=', code: 'Equal', finger: 'pinky' },
  ],
  [
    { label: 'Q', code: 'KeyQ', finger: 'pinky' },
    { label: 'W', code: 'KeyW', finger: 'ring' },
    { label: 'E', code: 'KeyE', finger: 'middle' },
    { label: 'R', code: 'KeyR', finger: 'index' },
    { label: 'T', code: 'KeyT', finger: 'index' },
    { label: 'Y', code: 'KeyY', finger: 'index' },
    { label: 'U', code: 'KeyU', finger: 'index' },
    { label: 'I', code: 'KeyI', finger: 'middle' },
    { label: 'O', code: 'KeyO', finger: 'ring' },
    { label: 'P', code: 'KeyP', finger: 'pinky' },
    { label: '[', code: 'BracketLeft', finger: 'pinky' },
    { label: ']', code: 'BracketRight', finger: 'pinky' },
    { label: '\\', code: 'Backslash', finger: 'pinky' },
  ],
  [
    { label: 'A', code: 'KeyA', finger: 'pinky' },
    { label: 'S', code: 'KeyS', finger: 'ring' },
    { label: 'D', code: 'KeyD', finger: 'middle' },
    { label: 'F', code: 'KeyF', finger: 'index' },
    { label: 'G', code: 'KeyG', finger: 'index' },
    { label: 'H', code: 'KeyH', finger: 'index' },
    { label: 'J', code: 'KeyJ', finger: 'index' },
    { label: 'K', code: 'KeyK', finger: 'middle' },
    { label: 'L', code: 'KeyL', finger: 'ring' },
    { label: ';', code: 'Semicolon', finger: 'pinky' },
    { label: "'", code: 'Quote', finger: 'pinky' },
  ],
  [
    { label: 'Z', code: 'KeyZ', finger: 'pinky' },
    { label: 'X', code: 'KeyX', finger: 'ring' },
    { label: 'C', code: 'KeyC', finger: 'middle' },
    { label: 'V', code: 'KeyV', finger: 'index' },
    { label: 'B', code: 'KeyB', finger: 'index' },
    { label: 'N', code: 'KeyN', finger: 'index' },
    { label: 'M', code: 'KeyM', finger: 'index' },
    { label: ',', code: 'Comma', finger: 'middle' },
    { label: '.', code: 'Period', finger: 'ring' },
    { label: '/', code: 'Slash', finger: 'pinky' },
  ],
  [{ label: 'Space', code: 'Space', finger: 'thumb', width: 280 }],
];

// 每一行左右手的分界索引（与 keyboard.ts 的 HAND_SPLIT_INDEXES 一致）
const MINI_HAND_SPLITS = [6, 5, 5, 5, 1];

/** 带 hand 字段的完整缩略键盘行数据 */
const MINI_ROWS: MiniKey[][] = MINI_ROW_SEEDS.map((row, rowIdx) => {
  const split = MINI_HAND_SPLITS[rowIdx] ?? row.length;
  return row.map((key, i) => ({
    ...key,
    hand: (i < split ? 'left' : 'right') as Hand,
  }));
});

/** code -> { hand, finger, label } 快速查找表 */
const MINI_CODE_MAP = new Map<string, { hand: Hand; finger: Finger; label: string }>();
for (const row of MINI_ROWS) {
  for (const key of row) {
    MINI_CODE_MAP.set(key.code, { hand: key.hand, finger: key.finger, label: key.label });
  }
}

const MINI_KEY_W = 44;
const MINI_KEY_H = 40;
const MINI_GAP = 5;
const MINI_PAD = 10;
const MINI_CANVAS_W = MINI_PAD * 2 + 13 * MINI_KEY_W + 12 * MINI_GAP;
const MINI_CANVAS_H = MINI_PAD * 2 + 5 * MINI_KEY_H + 4 * MINI_GAP;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 键盘参考区渲染器：在 #keyboard-ref canvas 上绘制缩略键盘，
 * 支持下一键提示（hint）、层级高亮（layer）与按键反馈（pressed）三种状态，
 * 与 KeyboardRenderer（DOM 版）的状态类一一对应。
 */
class MiniKeyboardCanvas {
  private ctx: CanvasRenderingContext2D | null = null;
  private hintCode: string | null = null;
  private layerCodes = new Set<string>();
  private pressedCode: string | null = null;
  private pressTimer: number | null = null;
  private errorCode: string | null = null;
  private errorTimer: number | null = null;

  constructor(canvas: HTMLCanvasElement | null) {
    if (!canvas) {
      return;
    }
    canvas.width = MINI_CANVAS_W;
    canvas.height = MINI_CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.draw();
  }

  setHint(code: string | null): void {
    this.hintCode = code;
    this.draw();
  }

  setLayer(codes: string[]): void {
    this.layerCodes = new Set(codes);
    this.draw();
  }

  press(code: string): void {
    if (!this.ctx) {
      return;
    }
    this.pressedCode = code;
    this.draw();
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
    }
    this.pressTimer = window.setTimeout(() => {
      this.pressedCode = null;
      this.draw();
    }, MINI_PRESS_MS);
  }

  /** 错误按键反馈：红色闪烁该键（时长长于普通按下），与 press 互斥且优先 */
  pressError(code: string): void {
    if (!this.ctx) {
      return;
    }
    this.errorCode = code;
    this.pressedCode = null;
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.draw();
    if (this.errorTimer !== null) {
      window.clearTimeout(this.errorTimer);
    }
    this.errorTimer = window.setTimeout(() => {
      this.errorCode = null;
      this.draw();
    }, MINI_ERROR_MS);
  }

  dispose(): void {
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    if (this.errorTimer !== null) {
      window.clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, MINI_CANVAS_W, MINI_CANVAS_H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, MINI_CANVAS_W, MINI_CANVAS_H);

    for (let rowIdx = 0; rowIdx < MINI_ROWS.length; rowIdx++) {
      const row = MINI_ROWS[rowIdx];
      const y = MINI_PAD + rowIdx * (MINI_KEY_H + MINI_GAP);
      let x = MINI_PAD;
      if (row.length === 1 && row[0].width) {
        // 空格行居中
        x = (MINI_CANVAS_W - row[0].width) / 2;
      }
      for (const key of row) {
        const w = key.width ?? MINI_KEY_W;
        this.drawKey(ctx, key, x, y, w);
        x += w + MINI_GAP;
      }
    }
  }

  private drawKey(
    ctx: CanvasRenderingContext2D,
    key: MiniKey,
    x: number,
    y: number,
    w: number
  ): void {
    const isError = this.errorCode === key.code;
    const isPressed = !isError && this.pressedCode === key.code;
    const isHint = !isPressed && !isError && this.hintCode === key.code;
    const isLayer = !isPressed && !isError && !isHint && this.layerCodes.has(key.code);

    ctx.save();
    if (isError) {
      ctx.fillStyle = '#f43f5e';
    } else if (isPressed) {
      ctx.fillStyle = '#38bdf8';
    } else if (isHint) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    } else if (isLayer) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
    } else {
      ctx.fillStyle = HAND_FILL[key.hand];
    }

    if (isError) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 12;
    } else if (isHint || isPressed) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      if (isHint) {
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
      }
    } else {
      ctx.strokeStyle = FINGER_COLORS[key.finger];
      ctx.lineWidth = 1.5;
    }

    roundRectPath(ctx, x, y, w, MINI_KEY_H, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isPressed ? '#0f172a' : '#f8fafc';
    ctx.font = key.width ? '600 12px "Segoe UI", sans-serif' : '700 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key.label, x + w / 2, y + MINI_KEY_H / 2);
  }
}

// ---------------------------------------------------------------------------
// 手指图示（DOM 版）
// ---------------------------------------------------------------------------

/**
 * 在训练面板键盘参考区下方渲染左右手手指图示，
 * 支持当 hint 某键时高亮对应手指。
 */
class MiniHandsDiagram {
  private readonly container: HTMLElement;
  private readonly fingerEls = new Map<string, HTMLElement>();
  private activeKey: string | null = null;

  constructor(container: HTMLElement | null) {
    if (!container) {
      this.container = document.createElement('div');
      return;
    }
    this.container = container;
    this.render();
  }

  /** 高亮指定手 + 手指 */
  setHighlight(hand: Hand | null, finger: Finger | null): void {
    this.clearHighlight();
    if (!hand || !finger) return;
    const key = `${hand}:${finger}`;
    const el = this.fingerEls.get(key);
    if (el) {
      el.classList.add('mini-finger--hint');
      this.activeKey = key;
    }
  }

  /** 清除所有手指高亮 */
  clearHighlight(): void {
    if (this.activeKey) {
      this.fingerEls.get(this.activeKey)?.classList.remove('mini-finger--hint');
      this.activeKey = null;
    }
  }

  private render(): void {
    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'mini-hands-wrapper';

    wrapper.appendChild(
      this.createHand('左手', 'left', ['pinky', 'ring', 'middle', 'index', 'thumb'])
    );
    wrapper.appendChild(
      this.createHand('右手', 'right', ['thumb', 'index', 'middle', 'ring', 'pinky'])
    );

    this.container.appendChild(wrapper);
  }

  private createHand(label: string, handSide: Hand, fingers: Finger[]): HTMLElement {
    const hand = document.createElement('div');
    hand.className = `mini-hand mini-hand--${handSide}`;

    const title = document.createElement('div');
    title.className = 'mini-hand-label';
    title.textContent = label;
    hand.appendChild(title);

    const fingersEl = document.createElement('div');
    fingersEl.className = 'mini-fingers';
    for (const finger of fingers) {
      const fingerEl = document.createElement('div');
      fingerEl.className = `mini-finger mini-finger--${finger}`;
      fingerEl.title = `${label}·${FINGER_NAMES[finger]}`;
      this.fingerEls.set(`${handSide}:${finger}`, fingerEl);
      fingersEl.appendChild(fingerEl);
    }
    hand.appendChild(fingersEl);

    return hand;
  }
}

// ---------------------------------------------------------------------------
// TrainPanel
// ---------------------------------------------------------------------------

export interface TrainPanelDeps {
  /** 统一输入引擎（事件转发给 TrainEngine） */
  typingEngine: TypingEngine;
  /** DOM 版键盘渲染器，可能为 null（旧键盘容器不存在时），调用需可选链 */
  keyboard: KeyboardRenderer | null;
  /** 词库（单词练习取词） */
  vocabulary: VocabularyBank;
  /** 用户进度（会话与键位统计持久化） */
  progress: UserProgress;
  /** 记忆曲线复习调度（可选；单词/复习练习完成后回写掌握度与复习间隔） */
  review?: ReviewScheduler;
  /** 获取当前用户名（结果弹窗展示用） */
  currentUser: () => string;
}

/**
 * 指法训练面板协调器。
 *
 * 协调 TrainEngine（练习逻辑）、KeyboardRenderer（DOM 键盘）、
 * VocabularyBank（词库）、UserProgress（进度持久化）与 #panel-train 的 DOM：
 * 子标签切换、三种练习模式（键位/单词/文章）的序列生成与流程控制、
 * 双行对照文本渲染、实时统计、键盘提示与按键动画、结果弹窗与下一关。
 */
export class TrainPanel {
  private readonly deps: TrainPanelDeps;
  private readonly trainEngine = new TrainEngine();
  private readonly miniKeyboard: MiniKeyboardCanvas;
  private readonly miniHands: MiniHandsDiagram;

  private readonly abort = new AbortController();
  private readonly disposers: (() => void)[] = [];

  // DOM 引用
  private panel!: HTMLElement;
  private tabButtons!: NodeListOf<HTMLElement>;
  private levelSelectWrap!: HTMLElement;
  private levelSelector!: HTMLSelectElement;
  private articleWrap!: HTMLElement;
  private articleTextarea!: HTMLTextAreaElement;
  private articleLoadBtn!: HTMLButtonElement;
  private articleSelect!: HTMLSelectElement;
  private articleRandomBtn!: HTMLButtonElement;
  private articleSeqBtn!: HTMLButtonElement;
  private wordSelectWrap!: HTMLElement;
  private wordCategoryList!: HTMLElement;
  private wordDifficultySelect!: HTMLSelectElement;
  private textTarget!: HTMLElement;
  private textInput!: HTMLElement;
  private statWpm!: HTMLElement;
  private statCpm!: HTMLElement;
  private statAccuracy!: HTMLElement;
  private statProgress!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private modal!: HTMLElement;
  private modalTitle!: HTMLElement;
  private resultStats!: HTMLElement;
  private resultErrors!: HTMLElement;
  private resultCloseBtn!: HTMLButtonElement;
  private statusBadge!: HTMLElement;
  private cursorEl!: HTMLSpanElement;
  private phaseWrap!: HTMLElement;
  private phaseIndicator!: HTMLElement;
  private fingerHintEl!: HTMLElement;

  // 练习状态
  private mode: PracticeMode = 'key-drill';
  private levelIndex = 0;
  private phaseIndex = 0;
  /** 当前加载的预装文章在 PRESET_ARTICLES 中的索引；-1 表示用户粘贴的自定义文章 */
  private articleIndex = -1;
  /** 单词练习取词偏好（分类多选 + 难度范围），持久化到 localStorage */
  private wordPref: WordPracticePref = { categories: [], difficulty: 'all' };
  private pendingText = '';
  private sessionStartedAt: number | null = null;
  /** 当前单词类练习涉及的单词 ID 与文本（练习完成后回写掌握度与复习调度） */
  private activeWordIds: string[] = [];
  private activeWordTexts: string[] = [];

  // 渲染缓存
  private readonly targetSpans: HTMLSpanElement[] = [];
  private readonly inputSpans: HTMLSpanElement[] = [];
  private renderedTargetText = '';
  /** 刚敲错的输入行位置（原始下标），用于在下次渲染时对该 span 施加一次性 shake 动画 */
  private pendingShakeIndex: number | null = null;

  constructor(deps: TrainPanelDeps) {
    this.deps = deps;
    this.cacheDom();
    const canvas = document.getElementById('keyboard-ref');
    this.miniKeyboard = new MiniKeyboardCanvas(canvas instanceof HTMLCanvasElement ? canvas : null);
    const handsContainer = document.getElementById('mini-hands-diagram');
    this.miniHands = new MiniHandsDiagram(handsContainer);
    this.bindEvents();
    this.registerEngineCallbacks();
    this.initLevelSelector();
    this.initArticleSelector();
    this.initWordSelector();
    this.updatePhaseIndicator();
    this.preparePreview();
  }

  /** 释放面板持有的监听器与定时器 */
  destroy(): void {
    this.abort.abort();
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers.length = 0;
    this.miniKeyboard.dispose();
  }

  /**
   * 循环切换练习层级（仅在 key-drill 模式下有效）。
   * @param delta -1 表示上一层级，+1 表示下一层级，到边界时循环。
   */
  cycleLevel(delta: number): void {
    if (this.mode !== 'key-drill') return;
    const count = TRAINING_LEVELS.length;
    this.levelIndex = (((this.levelIndex + delta) % count) + count) % count;
    this.levelSelector.value = TRAINING_LEVELS[this.levelIndex].id;
    this.resetPractice();
  }

  /**
   * 循环切换练习阶段（仅在 key-drill 模式下有效）。
   * @param delta -1 表示上一阶段，+1 表示下一阶段，到边界时循环。
   */
  cyclePhase(delta: number): void {
    if (this.mode !== 'key-drill') return;
    const count = DRILL_PHASES.length;
    this.phaseIndex = (((this.phaseIndex + delta) % count) + count) % count;
    this.updatePhaseIndicator();
    this.resetPractice();
  }

  /**
   * 开始一段“今日复习”练习：从给定单词 ID 列表取词，切换到单词练习布局并立即开始。
   * 完成后会把每个单词的正误回写到 UserProgress 与 ReviewScheduler。
   * @returns 是否有可复习单词（false 表示列表为空或单词已不存在）
   */
  startReview(wordIds: string[]): boolean {
    const words = wordIds
      .map((id) => this.deps.vocabulary.getWordById(id))
      .filter((w): w is WordEntry => w !== undefined);
    if (words.length === 0) {
      return false;
    }
    if (this.mode !== 'word') {
      this.switchMode('word');
    }
    this.activeWordIds = words.map((w) => w.id);
    this.activeWordTexts = words.map((w) => w.text);
    this.pendingText = this.trainEngine.generateWordPractice(this.activeWordTexts);
    this.renderPreview(this.pendingText);
    this.startPractice();
    return true;
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  private cacheDom(): void {
    this.panel = requireEl<HTMLElement>('panel-train');
    this.tabButtons = document.querySelectorAll<HTMLElement>('.train-tab-btn');
    this.levelSelectWrap = requireEl<HTMLElement>('train-level-select');
    this.levelSelector = requireEl<HTMLSelectElement>('level-selector');
    this.articleWrap = requireEl<HTMLElement>('train-article-input');
    this.articleTextarea = requireEl<HTMLTextAreaElement>('article-textarea');
    this.articleLoadBtn = requireEl<HTMLButtonElement>('article-load-btn');
    this.articleSelect = requireEl<HTMLSelectElement>('article-select');
    this.articleRandomBtn = requireEl<HTMLButtonElement>('article-random-btn');
    this.articleSeqBtn = requireEl<HTMLButtonElement>('article-seq-btn');
    this.wordSelectWrap = requireEl<HTMLElement>('train-word-select');
    this.wordCategoryList = requireEl<HTMLElement>('word-category-list');
    this.wordDifficultySelect = requireEl<HTMLSelectElement>('word-difficulty-select');
    this.textTarget = requireEl<HTMLElement>('text-target');
    this.textInput = requireEl<HTMLElement>('text-input');
    // 清空模板残留的注释/缩进空白文本节点：容器为 white-space:pre-wrap，
    // 残留空白会被渲染为可见缩进/空行，破坏逐字符左对齐
    this.textTarget.textContent = '';
    this.textInput.textContent = '';
    this.statWpm = requireEl<HTMLElement>('stat-wpm');
    this.statCpm = requireEl<HTMLElement>('stat-cpm');
    this.statAccuracy = requireEl<HTMLElement>('stat-accuracy');
    this.statProgress = requireEl<HTMLElement>('stat-progress');
    this.startBtn = requireEl<HTMLButtonElement>('train-start-btn');
    this.resetBtn = requireEl<HTMLButtonElement>('train-reset-btn');
    this.nextBtn = requireEl<HTMLButtonElement>('train-next-btn');
    this.modal = requireEl<HTMLElement>('train-result-modal');
    const title = this.modal.querySelector('h3');
    this.modalTitle = (title ?? this.modal) as HTMLElement;
    this.resultStats = requireEl<HTMLElement>('result-stats');
    this.resultErrors = requireEl<HTMLElement>('result-errors');
    this.resultCloseBtn = requireEl<HTMLButtonElement>('result-close-btn');
    this.statusBadge = requireEl<HTMLElement>('train-status-badge');
    this.phaseWrap = requireEl<HTMLElement>('train-phase-select');
    this.phaseIndicator = requireEl<HTMLElement>('phase-indicator');
    this.fingerHintEl = requireEl<HTMLElement>('mini-finger-hint');
    this.cursorEl = document.createElement('span');
    this.cursorEl.className = 'cursor';
  }

  private bindEvents(): void {
    const opts = { signal: this.abort.signal };

    this.tabButtons.forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const mode = btn.getAttribute('data-train-tab');
          if (mode === 'key-drill' || mode === 'word' || mode === 'article') {
            this.switchMode(mode);
          }
        },
        opts
      );
    });

    this.levelSelector.addEventListener('change', () => this.handleLevelChange(), opts);
    this.articleLoadBtn.addEventListener(
      'click',
      () => {
        // 粘贴自定义文章：清除预装文章选中态
        this.articleIndex = -1;
        this.articleSelect.value = '';
        this.handleArticleLoad();
      },
      opts
    );
    this.articleSelect.addEventListener('change', () => this.handleArticleSelectChange(), opts);
    this.articleRandomBtn.addEventListener('click', () => this.handleArticleRandom(), opts);
    this.articleSeqBtn.addEventListener('click', () => this.handleArticleSeq(), opts);
    this.startBtn.addEventListener('click', () => this.startPractice(), opts);
    this.resetBtn.addEventListener('click', () => this.resetPractice(), opts);
    this.nextBtn.addEventListener('click', () => this.handleNext(), opts);
    this.resultCloseBtn.addEventListener('click', () => this.hideResultModal(), opts);

    const offTyping = this.deps.typingEngine.on((event) => this.handleTypingEvent(event));
    this.disposers.push(offTyping);

    // 全局快捷键：Ctrl+Shift+1/2/3 切换子标签，Ctrl+←/→ 切换阶段，Tab 在 idle 状态开始练习
    window.addEventListener('keydown', (e) => this.handleGlobalKeydown(e), opts);
  }

  private registerEngineCallbacks(): void {
    this.trainEngine.onProgress((p) => this.handleProgress(p));
    this.trainEngine.onComplete((p) => this.handleComplete(p));
    // 记录刚敲错的位置：onMistake 在字符写入后、自动跳行前触发，
    // 此刻 userInput 末尾即错误字符，其下标用于下次 syncInputSpans 施加 shake。
    this.trainEngine.onMistake(() => {
      this.pendingShakeIndex = this.trainEngine.getUserInput().length - 1;
    });
  }

  private initLevelSelector(): void {
    this.levelSelector.innerHTML = '';
    for (const level of TRAINING_LEVELS) {
      const option = document.createElement('option');
      option.value = level.id;
      option.textContent = `${level.name}（${level.description}）`;
      this.levelSelector.appendChild(option);
    }
    this.levelSelector.value = this.currentLevel().id;
  }

  /** 按难度分组（optgroup）填充预装文章下拉框，首项为占位提示 */
  private initArticleSelector(): void {
    this.articleSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— 选择预装文章 —';
    this.articleSelect.appendChild(placeholder);

    for (const difficulty of ARTICLE_DIFFICULTIES) {
      const articles = PRESET_ARTICLES.filter((a) => a.difficultyId === difficulty.id);
      if (articles.length === 0) {
        continue;
      }
      const group = document.createElement('optgroup');
      group.label = `${difficulty.name}·${difficulty.description}`;
      for (const article of articles) {
        const option = document.createElement('option');
        option.value = article.id;
        option.textContent = article.source
          ? `${article.title} · ${article.source}`
          : article.title;
        group.appendChild(option);
      }
      this.articleSelect.appendChild(group);
    }
    this.articleSelect.value = '';
  }

  // -------------------------------------------------------------------------
  // 子标签切换与模式准备
  // -------------------------------------------------------------------------

  private switchMode(mode: PracticeMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-train-tab') === mode);
    });
    this.levelSelectWrap.style.display = mode === 'key-drill' ? '' : 'none';
    this.phaseWrap.style.display = mode === 'key-drill' ? '' : 'none';
    this.wordSelectWrap.style.display = mode === 'word' ? '' : 'none';
    this.articleWrap.style.display = mode === 'article' ? '' : 'none';
    this.resetPractice();
  }

  private handleLevelChange(): void {
    const index = TRAINING_LEVELS.findIndex((l) => l.id === this.levelSelector.value);
    if (index < 0) {
      return;
    }
    this.levelIndex = index;
    this.resetPractice();
  }

  private handleArticleLoad(): void {
    const normalized = this.normalizeArticle(this.articleTextarea.value);
    this.pendingText = normalized ? this.trainEngine.setArticle(normalized) : '';
    if (this.pendingText) {
      this.renderPreview(this.pendingText);
    } else {
      this.renderModeHint();
    }
  }

  /** 加载指定索引的预装文章：回填 textarea / 下拉框并渲染预览 */
  private loadArticleByIndex(index: number): void {
    const article = PRESET_ARTICLES[index];
    if (!article) {
      return;
    }
    this.articleIndex = index;
    this.articleTextarea.value = article.content;
    this.articleSelect.value = article.id;
    this.handleArticleLoad();
  }

  /** 下拉选择预装文章 */
  private handleArticleSelectChange(): void {
    const id = this.articleSelect.value;
    if (!id) {
      return;
    }
    const index = PRESET_ARTICLES.findIndex((a) => a.id === id);
    if (index >= 0) {
      this.loadArticleByIndex(index);
    }
  }

  /** 随机加载一篇预装文章（避开当前篇） */
  private handleArticleRandom(): void {
    const currentId = this.articleIndex >= 0 ? PRESET_ARTICLES[this.articleIndex]?.id : undefined;
    const picked = randomPresetArticle(currentId);
    if (!picked) {
      return;
    }
    const index = PRESET_ARTICLES.findIndex((a) => a.id === picked.id);
    if (index >= 0) {
      this.loadArticleByIndex(index);
    }
  }

  /** 按由浅入深顺序加载下一篇预装文章 */
  private handleArticleSeq(): void {
    const next = nextPresetArticle(this.articleIndex);
    if (!next) {
      return;
    }
    const index = PRESET_ARTICLES.findIndex((a) => a.id === next.id);
    if (index >= 0) {
      this.loadArticleByIndex(index);
    }
  }

  /**
   * 文章文本归一化：保留换行以维持段落/行结构（输入时由 TrainEngine 自动跳过），
   * 制表符与回车统一归一为换行或空格，连续空白折叠为一个。
   */
  private normalizeArticle(raw: string): string {
    return raw
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /** 构建单词练习的分类勾选框与难度下拉，并恢复上次选择 */
  private initWordSelector(): void {
    const categories = this.deps.vocabulary.getCategories();
    const saved = this.loadWordPref();
    // 无存档时默认全选，等价于不按分类过滤（兼容既有「从全部词库取词」行为）
    this.wordPref = saved ?? { categories: categories.map((c) => c.id), difficulty: 'all' };

    this.wordCategoryList.innerHTML = '';
    for (const cat of categories) {
      const label = document.createElement('label');
      label.className = 'word-category-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = cat.id;
      checkbox.checked = this.wordPref.categories.includes(cat.id);
      checkbox.addEventListener(
        'change',
        () => this.handleWordCategoryToggle(cat.id, checkbox.checked),
        { signal: this.abort.signal }
      );
      const text = document.createElement('span');
      text.textContent = cat.name;
      label.append(checkbox, text);
      this.wordCategoryList.appendChild(label);
    }

    this.wordDifficultySelect.value = this.wordPref.difficulty;
    this.wordDifficultySelect.addEventListener('change', () => this.handleWordDifficultyChange(), {
      signal: this.abort.signal,
    });
  }

  /** 勾选/取消某个分类后持久化偏好并重新取词 */
  private handleWordCategoryToggle(id: string, checked: boolean): void {
    const set = new Set(this.wordPref.categories);
    if (checked) {
      set.add(id);
    } else {
      set.delete(id);
    }
    this.wordPref.categories = [...set];
    this.saveWordPref();
    this.resetPractice();
  }

  /** 切换难度范围后持久化偏好并重新取词 */
  private handleWordDifficultyChange(): void {
    this.wordPref.difficulty = this.wordDifficultySelect.value;
    this.saveWordPref();
    this.resetPractice();
  }

  /** 把难度范围选项映射为 getWords 的 difficulties 过滤（all 返回 undefined 不过滤） */
  private difficultyFilter(): Difficulty[] | undefined {
    switch (this.wordPref.difficulty) {
      case 'easy':
        return [1, 2];
      case 'medium':
        return [3];
      case 'hard':
        return [4, 5];
      default:
        return undefined;
    }
  }

  private loadWordPref(): WordPracticePref | null {
    try {
      const raw = localStorage.getItem(WORD_PREF_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as WordPracticePref;
      if (!parsed || !Array.isArray(parsed.categories)) {
        return null;
      }
      return {
        categories: parsed.categories.filter((c) => typeof c === 'string'),
        difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty : 'all',
      };
    } catch {
      return null;
    }
  }

  private saveWordPref(): void {
    try {
      localStorage.setItem(WORD_PREF_KEY, JSON.stringify(this.wordPref));
    } catch {
      // ignore
    }
  }

  /** 按当前模式生成目标文本并渲染预览（不进入计分状态） */
  private preparePreview(): void {
    this.activeWordIds = [];
    this.activeWordTexts = [];
    switch (this.mode) {
      case 'key-drill': {
        const level = this.currentLevel();
        const phase: DrillPhase = DRILL_PHASES[this.phaseIndex].id;
        this.pendingText = this.trainEngine.generateKeyDrill(level, phase);
        this.applyLayerHighlight(level);
        break;
      }
      case 'word': {
        const words = this.deps.vocabulary.getWords({
          categories: this.wordPref.categories,
          difficulties: this.difficultyFilter(),
          limit: WORD_COUNT,
        });
        this.activeWordIds = words.map((w) => w.id);
        this.activeWordTexts = words.map((w) => w.text);
        this.pendingText = this.trainEngine.generateWordPractice(this.activeWordTexts);
        this.clearLayerHighlight();
        break;
      }
      case 'article': {
        const normalized = this.normalizeArticle(this.articleTextarea.value);
        this.pendingText = normalized ? this.trainEngine.setArticle(normalized) : '';
        this.clearLayerHighlight();
        break;
      }
    }

    if (this.pendingText) {
      this.renderPreview(this.pendingText);
    } else {
      this.renderModeHint();
    }
  }

  private renderPreview(text: string): void {
    this.syncTargetSpans(text);
    this.updateTargetStates(0);
    this.clearInputDisplay();
    this.updateStatsDisplay(0, 0, 0, 0, countTypeable(text));
    this.updateHint(text.length > 0 ? text[0] : null);
    this.resetScroll();
  }

  private renderModeHint(): void {
    const hints: Record<PracticeMode, string> = {
      'key-drill': '请选择练习层级，然后点击「开始练习」。',
      word: '词库为空，请先在词库管理中添加单词。',
      article: '选择一篇预装文章、随机/由浅入深加载，或粘贴自己的文章后点击「加载文章」。',
    };
    this.targetSpans.length = 0;
    this.renderedTargetText = '';
    this.textTarget.textContent = hints[this.mode];
    this.clearInputDisplay();
    this.updateStatsDisplay(0, 0, 0, 0, 0);
    this.updateHint(null);
  }

  // -------------------------------------------------------------------------
  // 练习流程控制
  // -------------------------------------------------------------------------

  private startPractice(): void {
    if (this.mode === 'article') {
      const normalized = this.normalizeArticle(this.articleTextarea.value);
      this.pendingText = normalized ? this.trainEngine.setArticle(normalized) : '';
    }
    if (!this.pendingText) {
      this.renderModeHint();
      return;
    }

    this.hideResultModal();
    this.nextBtn.style.display = 'none';
    this.sessionStartedAt = Date.now();
    this.updateStatusBadge('active');
    this.showCursor();
    this.trainEngine.start(this.pendingText);
    this.deps.typingEngine.focus();
  }

  private resetPractice(): void {
    this.trainEngine.reset();
    this.sessionStartedAt = null;
    this.hideResultModal();
    this.nextBtn.style.display = 'none';
    this.updateStatusBadge('idle');
    this.hideCursor();
    this.preparePreview();
  }

  private handleNext(): void {
    this.hideResultModal();
    if (this.mode === 'key-drill') {
      // 先尝试进入下一阶段，若已在最后阶段则进入下一层级并重置阶段
      if (this.phaseIndex < DRILL_PHASES.length - 1) {
        this.phaseIndex += 1;
        this.updatePhaseIndicator();
      } else if (this.levelIndex < TRAINING_LEVELS.length - 1) {
        this.levelIndex += 1;
        this.levelSelector.value = TRAINING_LEVELS[this.levelIndex].id;
        this.phaseIndex = 0;
        this.updatePhaseIndicator();
      }
    } else if (this.mode === 'article') {
      // 由浅入深：完成后自动加载下一篇预装文章（自定义文章则从库首开始）
      const next = nextPresetArticle(this.articleIndex);
      if (next) {
        const index = PRESET_ARTICLES.findIndex((a) => a.id === next.id);
        if (index >= 0) {
          this.articleIndex = index;
          this.articleTextarea.value = next.content;
          this.articleSelect.value = next.id;
        }
      }
    }
    this.resetPractice();
    this.startPractice();
  }

  private handleTypingEvent(event: TypingEvent): void {
    if (!this.isPanelActive()) {
      return;
    }

    // Escape：关闭弹窗或重置练习
    if (event.type === 'escape') {
      if (this.modal.style.display !== 'none') {
        this.hideResultModal();
      } else {
        this.resetPractice();
      }
      return;
    }

    // Enter：idle 状态开始练习，completed 状态下一关
    if (event.type === 'submit') {
      if (this.isPracticeIdle()) {
        this.startPractice();
      } else if (this.isPracticeCompleted()) {
        this.handleNext();
      }
      return;
    }

    // 字符按键反馈（键盘动画）：先判定该字符在当前目标位是否为错，
    // 错误则红色闪烁该键（pressError），正确则维持普通按下反馈（press）。
    if (event.type === 'char' && event.char) {
      const code = charToCode(event.char);
      if (code) {
        const nextChar = this.trainEngine.getNextChar();
        const isError = nextChar !== null && event.char !== nextChar;
        this.deps.keyboard?.pressKey(code);
        if (isError) {
          this.miniKeyboard.pressError(code);
        } else {
          this.miniKeyboard.press(code);
        }
      }
    }

    // backspace 和 char 转发给 TrainEngine
    this.trainEngine.handleInput(event);
  }

  /** 全局快捷键：Ctrl+Shift+数字切换子标签，Ctrl+←/→切换阶段，Tab 在 idle 状态开始练习 */
  private handleGlobalKeydown(e: KeyboardEvent): void {
    if (!this.isPanelActive()) {
      return;
    }

    // 不拦截其他输入框内的快捷键
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'select' || target.isContentEditable) {
        return;
      }
    }

    // Ctrl+Shift+1/2/3 切换子标签
    if (e.ctrlKey && e.shiftKey && !e.altKey) {
      const modeMap: Record<string, PracticeMode> = {
        '1': 'key-drill',
        '!': 'key-drill',
        '2': 'word',
        '@': 'word',
        '3': 'article',
        '#': 'article',
      };
      const mode = modeMap[e.key];
      if (mode) {
        e.preventDefault();
        this.switchMode(mode);
        return;
      }
    }

    // Ctrl+←/→ 切换练习阶段
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.cyclePhase(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.cyclePhase(1);
        return;
      }
    }

    // Tab 在 idle 状态开始练习（练习进行中不拦截）
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && this.isPracticeIdle()) {
      e.preventDefault();
      this.startPractice();
    }
  }

  // -------------------------------------------------------------------------
  // 引擎回调 -> DOM 更新
  // -------------------------------------------------------------------------

  private handleProgress(p: TrainProgress): void {
    this.syncTargetSpans(this.trainEngine.getTargetText());
    this.updateTargetStates(p.completed);
    this.syncInputSpans();
    const accuracy = p.completed > 0 ? (p.correct / p.completed) * 100 : 0;
    this.updateStatsDisplay(p.wpm, p.cpm, accuracy, p.completed, p.total);
    this.updateHint(this.trainEngine.getNextChar());
    this.scrollToCurrentLine();
  }

  private handleComplete(p: TrainProgress): void {
    this.updateHint(null);
    this.updateStatusBadge('completed');
    this.hideCursor();

    const durationMs = this.sessionStartedAt !== null ? Date.now() - this.sessionStartedAt : 0;
    const accuracy = p.completed > 0 ? (p.correct / p.completed) * 100 : 0;

    const mistakeKeys: Record<string, number> = {};
    for (const error of p.errors) {
      const key = mistakeKeyOf(error.expected);
      mistakeKeys[key] = (mistakeKeys[key] ?? 0) + 1;
    }

    this.deps.progress.recordSession({
      type: 'training',
      mode: this.sessionMode(),
      startedAt: this.sessionStartedAt ?? Date.now(),
      duration: durationMs,
      wpm: p.wpm,
      cpm: p.cpm,
      accuracy: Math.round(accuracy * 10) / 10,
      mistakeKeys,
    });

    for (const error of p.errors) {
      const key = mistakeKeyOf(error.expected);
      if (key) {
        this.deps.progress.recordKeyResult(key, false);
      }
    }

    this.recordWordResults();

    this.showResultModal(p, durationMs, accuracy);
    this.nextBtn.style.display = '';
  }

  /**
   * 单词类练习（单词模式 / 今日复习）完成后，按单词粒度判定正误并回写：
   * - UserProgress.recordWordResult 更新掌握度统计
   * - ReviewScheduler.recordResult 更新记忆曲线复习间隔
   *
   * 目标文本由单词以单个空格连接而成，据此按单词长度切分逐字符比对结果。
   */
  private recordWordResults(): void {
    if (this.activeWordIds.length === 0) {
      return;
    }
    const results = this.trainEngine.getCharResults();
    let index = 0;
    for (let i = 0; i < this.activeWordTexts.length; i++) {
      const text = this.activeWordTexts[i];
      let correct = true;
      for (let c = 0; c < text.length; c++) {
        const r = results[index + c];
        if (!r || r.correct !== true) {
          correct = false;
        }
      }
      index += text.length + 1; // 跳过单词间的连接空格
      const id = this.activeWordIds[i];
      if (id) {
        this.deps.progress.recordWordResult(id, correct);
        this.deps.review?.recordResult(id, correct);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 双行对照文本渲染
  // -------------------------------------------------------------------------

  /** 同步目标行 span 数量与文本（文本变化时全量更新字符内容，换行符渲染为 newline span） */
  private syncTargetSpans(text: string): void {
    const textChanged = text !== this.renderedTargetText;
    while (this.targetSpans.length < text.length) {
      const span = document.createElement('span');
      const char = text[this.targetSpans.length];
      span.className = char === '\n' ? 'char newline' : 'char';
      span.textContent = displayChar(char);
      this.targetSpans.push(span);
      this.textTarget.appendChild(span);
    }
    while (this.targetSpans.length > text.length) {
      this.targetSpans.pop()?.remove();
    }
    if (textChanged) {
      for (let i = 0; i < text.length; i++) {
        this.targetSpans[i].textContent = displayChar(text[i]);
      }
      this.renderedTargetText = text;
    }
  }

  /**
   * 更新目标行类名：目标行作为干净的「原行」参照，统一可读颜色，
   * 仅标记当前位置 .current（换行符保留 .newline）。
   * 进度与正误反馈全部下沉到下方输入行，原行不做亮/淡进度、不标红。
   */
  private updateTargetStates(completed: number): void {
    const total = this.targetSpans.length;
    for (let i = 0; i < total; i++) {
      let cls = this.targetSpans[i].classList.contains('newline') ? 'char newline' : 'char';
      if (i === completed && completed < total) {
        cls += ' current';
      }
      const span = this.targetSpans[i];
      if (span.className !== cls) {
        span.className = cls;
      }
    }
  }

  /** 同步用户输入行 span（数量 = 已输入长度，类名区分正误） */
  private syncInputSpans(): void {
    const results = this.trainEngine.getCharResults();
    const completed = this.trainEngine.getUserInput().length;

    while (this.inputSpans.length < completed) {
      const span = document.createElement('span');
      span.className = 'char';
      this.inputSpans.push(span);
      this.textInput.insertBefore(span, this.cursorEl);
    }
    while (this.inputSpans.length > completed) {
      this.inputSpans.pop()?.remove();
    }

    for (let i = 0; i < completed; i++) {
      const result = results[i];
      const span = this.inputSpans[i];
      if (!result || !span) {
        continue;
      }
      const isNewline = result.expected === '\n';
      const isIncorrect = result.correct === false;
      // 错误字符回显用户真实敲入的字符；错误空格用可见符号 ␣，避免红底药丸内空白不可辨
      const actual = result.actual ?? '';
      const text = isIncorrect && actual === ' ' ? '␣' : displayChar(actual);
      if (span.textContent !== text) {
        span.textContent = text;
      }
      // 换行符自动完成，渲染为不可见的换行 span 与目标行保持对齐
      const cls = isNewline
        ? 'char newline correct'
        : result.correct
          ? 'char correct'
          : 'char incorrect';
      if (span.className !== cls) {
        span.className = cls;
      }
    }

    // 输入行独立成块且可滚动：滚动到末尾，保证光标与最新输入始终可见
    this.textInput.scrollTop = this.textInput.scrollHeight;
    this.applyPendingShake();
  }

  /** 对刚敲错的输入 span 施加一次性 shake 动画（动画结束自动移除） */
  private applyPendingShake(): void {
    if (this.pendingShakeIndex === null) {
      return;
    }
    const span = this.inputSpans[this.pendingShakeIndex];
    this.pendingShakeIndex = null;
    if (!span) {
      return;
    }
    span.classList.remove('shake');
    // 强制 reflow 以重启动画（连续错误时也能重新触发）
    void span.offsetWidth;
    span.classList.add('shake');
    span.addEventListener('animationend', () => span.classList.remove('shake'), { once: true });
  }

  private clearInputDisplay(): void {
    while (this.inputSpans.length > 0) {
      this.inputSpans.pop()?.remove();
    }
    this.hideCursor();
  }

  // -------------------------------------------------------------------------
  // 状态徽章与光标
  // -------------------------------------------------------------------------

  private updateStatusBadge(state: 'idle' | 'active' | 'completed'): void {
    const labels: Record<string, string> = {
      idle: '等待开始',
      active: '练习中',
      completed: '已完成',
    };
    this.statusBadge.className = `status-badge ${state}`;
    this.statusBadge.textContent = labels[state];
  }

  private showCursor(): void {
    if (!this.cursorEl.parentNode) {
      this.textInput.appendChild(this.cursorEl);
    }
  }

  private hideCursor(): void {
    this.cursorEl.remove();
  }

  // -------------------------------------------------------------------------
  // 统计与键盘提示
  // -------------------------------------------------------------------------

  private updateStatsDisplay(
    wpm: number,
    cpm: number,
    accuracyPct: number,
    completed: number,
    total: number
  ): void {
    this.statWpm.textContent = String(Math.round(wpm));
    this.statCpm.textContent = String(Math.round(cpm));
    this.statAccuracy.textContent = `${accuracyPct.toFixed(1)}%`;
    this.statProgress.textContent = `${completed}/${total}`;
  }

  /** 提示下一个应输入的键（同时作用于 DOM 键盘与 canvas 参考键盘） */
  private updateHint(nextChar: string | null): void {
    const code = nextChar !== null ? charToCode(nextChar) || null : null;
    if (code !== null) {
      this.deps.keyboard?.hintNext(code);
    } else {
      this.deps.keyboard?.clearHint();
    }
    this.miniKeyboard.setHint(code);
    this.updateFingerHint(code);
  }

  /** 更新手指/手提示文字并高亮手指图示（如「左手 食指」） */
  private updateFingerHint(code: string | null): void {
    if (!code) {
      this.fingerHintEl.textContent = '';
      this.miniHands.clearHighlight();
      return;
    }
    const info = MINI_CODE_MAP.get(code);
    if (!info) {
      this.fingerHintEl.textContent = '';
      this.miniHands.clearHighlight();
      return;
    }
    const handName = info.hand === 'left' ? '左手' : '右手';
    const fingerName = FINGER_NAMES[info.finger];
    this.fingerHintEl.textContent = `${info.label} → ${handName} ${fingerName}`;
    this.miniHands.setHighlight(info.hand, info.finger);
  }

  private applyLayerHighlight(level: TrainingLevel): void {
    const codes = level.keys.map((k) => charToCode(k)).filter((c) => c !== '');
    this.deps.keyboard?.highlightLayer(codes);
    this.miniKeyboard.setLayer(codes);
  }

  private clearLayerHighlight(): void {
    this.deps.keyboard?.clearLayer();
    this.miniKeyboard.setLayer([]);
  }

  // -------------------------------------------------------------------------
  // 结果弹窗
  // -------------------------------------------------------------------------

  private showResultModal(p: TrainProgress, durationMs: number, accuracy: number): void {
    // 按「应为字符 + 实际敲入字符」配对聚合错误次数
    const counts = new Map<string, { expected: string; actual: string; count: number }>();
    for (const error of p.errors) {
      const actual = error.actual ?? '';
      const key = `${error.expected}\u0000${actual}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { expected: error.expected, actual, count: 1 });
      }
    }

    this.resultStats.innerHTML = [
      this.statItem('WPM', String(Math.round(p.wpm))),
      this.statItem('CPM', String(Math.round(p.cpm))),
      this.statItem('正确率', `${accuracy.toFixed(1)}%`),
      this.statItem('耗时', formatDuration(durationMs)),
    ].join('');

    if (counts.size === 0) {
      this.resultErrors.innerHTML = '<div>零错误，太棒了！继续保持。</div>';
    } else {
      const items = [...counts.values()]
        .sort((a, b) => b.count - a.count)
        .map(({ expected, actual, count }) => {
          const expDisplay = expected === ' ' ? '␣' : escapeHtml(expected);
          const actDisplay = actual === ' ' ? '␣' : escapeHtml(actual);
          return `<div>应为 <span class="err-exp">${expDisplay}</span>，你敲了 <span class="err-act">${actDisplay}</span>（${count} 次）</div>`;
        });
      this.resultErrors.innerHTML = items.join('');
    }

    const name = this.deps.currentUser();
    this.modalTitle.textContent = name ? `${name}，练习完成！` : '练习完成';
    this.modal.style.display = 'flex';
  }

  private hideResultModal(): void {
    this.modal.style.display = 'none';
  }

  private statItem(label: string, value: string): string {
    return `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  }

  // -------------------------------------------------------------------------
  // 视窗滚动跟随
  // -------------------------------------------------------------------------

  /** 滚动文本容器使当前输入位置所在行保持在视窗上方区域 */
  private scrollToCurrentLine(): void {
    const display = this.textTarget.parentElement;
    if (!display) return;

    const currentIndex = this.trainEngine.getUserInput().length;
    const currentSpan =
      this.targetSpans[currentIndex] ?? this.targetSpans[this.targetSpans.length - 1];
    if (!currentSpan) return;

    const displayRect = display.getBoundingClientRect();
    const spanRect = currentSpan.getBoundingClientRect();

    // 当前 span 相对于容器可视区顶部的偏移
    const spanRelativeTop = spanRect.top - displayRect.top;
    const visibleHeight = displayRect.height;

    // 仅当 span 位于可视区下方 40% 或超出可视区上方时触发滚动
    if (spanRelativeTop > visibleHeight * 0.6 || spanRelativeTop < 0) {
      // 滚动后将 span 放置在可视区顶部约 15% 处
      const targetScrollTop = display.scrollTop + spanRelativeTop - visibleHeight * 0.15;
      display.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    }
  }

  /** 重置文本容器滚动位置到顶部 */
  private resetScroll(): void {
    const display = this.textTarget.parentElement;
    if (display) {
      display.scrollTop = 0;
    }
  }

  // -------------------------------------------------------------------------
  // 辅助
  // -------------------------------------------------------------------------

  private currentLevel(): TrainingLevel {
    return TRAINING_LEVELS[this.levelIndex] ?? TRAINING_LEVELS[0];
  }

  /** 更新阶段指示器文本 */
  private updatePhaseIndicator(): void {
    const phase = DRILL_PHASES[this.phaseIndex];
    this.phaseIndicator.textContent = `${phase.name}（${this.phaseIndex + 1}/${DRILL_PHASES.length}）`;
    this.phaseIndicator.title = phase.description;
  }

  /** PracticeMode -> TrainingSession.mode（word 练习归入 free 自由练习） */
  private sessionMode(): TrainingSession['mode'] {
    if (this.mode === 'key-drill') {
      return 'key';
    }
    if (this.mode === 'article') {
      return 'article';
    }
    return 'free';
  }

  private isPanelActive(): boolean {
    return this.panel.classList.contains('active');
  }

  /** 练习尚未开始（idle 状态） */
  private isPracticeIdle(): boolean {
    return this.sessionStartedAt === null;
  }

  /** 练习已完成（下一关按钮可见） */
  private isPracticeCompleted(): boolean {
    return this.sessionStartedAt !== null && this.nextBtn.style.display !== 'none';
  }
}
