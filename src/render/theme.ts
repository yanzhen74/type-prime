/**
 * 主题系统（块三表现层打磨任务 5 的第三步，详见 PLAN.md §10.4.3）。
 *
 * 双源配色：DOM 侧颜色全部走 style.css 的 CSS 变量（按 html[data-theme] 分块），
 * Canvas 侧颜色集中在本文件的纯数据表 THEMES（游戏/缩略键盘绘制时取 token）。
 * 两侧各自单一来源，避免在 TS 里重复维护一份 CSS 值。
 *
 * 世界色不随主题变：僵尸躯体配色、植物炮台、炮弹、粒子预设、手指色、BOSS 紫
 * 属于「游戏世界标识色」，在三个主题下保持恒定（均为饱和中间调，深浅底都可读）；
 * 随主题变的是「版面色」：底/网格/文字/遮罩/语义色/左右手底色。
 */

/** 主题名：深空夜（默认）/ 纸墨白 / 磷光绿 */
export type ThemeName = 'night' | 'paper' | 'phosphor';

export const THEME_ORDER: ThemeName[] = ['night', 'paper', 'phosphor'];

export const THEME_LABELS: Record<ThemeName, string> = {
  night: '深空夜',
  paper: '纸墨白',
  phosphor: '磷光绿',
};

export const DEFAULT_THEME: ThemeName = 'night';

/** 本地存储键（沿用 typeprime_ 前缀约定） */
export const THEME_STORAGE_KEY = 'typeprime_theme';

/** Canvas 版面色 token：绘制代码只允许从这里取色，不得再写硬编码 hex */
export interface CanvasPalette {
  /** 画布底色（缩略键盘填充 / 血条槽等） */
  board: string;
  /** 背景网格线 */
  grid: string;
  /** 主文字 */
  ink: string;
  /** 次级文字 / 哑弹灰 */
  muted: string;
  /** 主强调色（锁定外的单词、倒计时、按下键） */
  accent: string;
  /** 强调色浅阶（冻结染蓝等） */
  accentSoft: string;
  /** 语义成功（已输入字符、基地线、通关横幅） */
  success: string;
  /** 语义危险（错误描边、失守标题） */
  danger: string;
  /** 危险强闪（危险线闪烁） */
  dangerHot: string;
  /** 危险浅阶（错误时未输入字符） */
  dangerSoft: string;
  /** 语义警告（锁定框、暂停、连击） */
  warn: string;
  /** 强调色底上的文字色（按下键的键帽字） */
  onAccent: string;
  /** 倒计时/暂停遮罩 */
  scrim: string;
  /** 结算页遮罩（更实） */
  scrimHeavy: string;
  /** 单词投影 */
  shadow: string;
  /** 左手区底色 */
  handLeft: string;
  /** 右手区底色 */
  handRight: string;
}

export interface ThemeDef {
  label: string;
  canvas: CanvasPalette;
}

/** 三套 Canvas 版面色；DOM 侧对应值见 style.css 的 [data-theme] 分块 */
export const THEMES: Record<ThemeName, ThemeDef> = {
  night: {
    label: THEME_LABELS.night,
    canvas: {
      board: '#020617',
      grid: '#1e293b',
      ink: '#f8fafc',
      muted: '#94a3b8',
      accent: '#38bdf8',
      accentSoft: '#7dd3fc',
      success: '#22c55e',
      danger: '#f43f5e',
      dangerHot: '#ff1f4b',
      dangerSoft: '#fca5a5',
      warn: '#fbbf24',
      onAccent: '#0f172a',
      scrim: 'rgba(15, 23, 42, 0.85)',
      scrimHeavy: 'rgba(15, 23, 42, 0.9)',
      shadow: 'rgba(0, 0, 0, 0.5)',
      handLeft: '#17324f',
      handRight: '#3d2340',
    },
  },
  paper: {
    label: THEME_LABELS.paper,
    canvas: {
      board: '#fbf7ee',
      grid: '#e5ddca',
      ink: '#1c2431',
      muted: '#5b6472',
      accent: '#0369a1',
      accentSoft: '#0284c7',
      success: '#15803d',
      danger: '#be123c',
      dangerHot: '#9f1239',
      dangerSoft: '#9f1239',
      warn: '#b45309',
      onAccent: '#fffdf7',
      scrim: 'rgba(255, 253, 247, 0.88)',
      scrimHeavy: 'rgba(255, 253, 247, 0.94)',
      shadow: 'rgba(28, 36, 49, 0.25)',
      handLeft: '#e0ecf7',
      handRight: '#f7e3ec',
    },
  },
  phosphor: {
    label: THEME_LABELS.phosphor,
    canvas: {
      board: '#020a05',
      grid: '#123524',
      ink: '#d1fae5',
      muted: '#4d8f68',
      accent: '#4ade80',
      accentSoft: '#86efac',
      success: '#a3e635',
      danger: '#fb7185',
      dangerHot: '#f43f5e',
      dangerSoft: '#fda4af',
      warn: '#facc15',
      onAccent: '#05130b',
      scrim: 'rgba(2, 10, 5, 0.88)',
      scrimHeavy: 'rgba(2, 10, 5, 0.94)',
      shadow: 'rgba(0, 0, 0, 0.6)',
      handLeft: '#0c2b1a',
      handRight: '#2b2410',
    },
  },
};

/** 判断任意值是否为合法主题名（存储读回时校验） */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_ORDER as string[]).includes(value);
}

/** 从本地存储读主题；缺失/损坏/不可用时回退默认 */
export function loadStoredTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(raw) ? raw : DEFAULT_THEME;
  } catch {
    // 隐私模式等存储不可用场景：仅内存生效
    return DEFAULT_THEME;
  }
}

/** hex(#rrggbb) → rgba() 字符串，供淡出/半透明填充复用版面色 */
export function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamped = Math.max(0, Math.min(1, a));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamped})`;
}

/**
 * 主题管理器：持有当前主题、持久化、同步 html[data-theme]、广播变更。
 * 游戏与缩略键盘通过 provider() 拿到「活」的取色函数，切主题不重建实例。
 */
export class ThemeManager {
  private name: ThemeName;
  private readonly listeners = new Set<(name: ThemeName) => void>();

  constructor(initial?: ThemeName) {
    this.name = initial ?? loadStoredTheme();
  }

  get current(): ThemeName {
    return this.name;
  }

  palette(): CanvasPalette {
    return THEMES[this.name].canvas;
  }

  /** 注入给游戏/缩略键盘的取色函数：每次绘制实时读当前主题 */
  provider(): () => CanvasPalette {
    return () => this.palette();
  }

  set(name: ThemeName): void {
    if (name === this.name) return;
    this.name = name;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch {
      // 存储不可用时仅内存生效
    }
    this.applyDom();
    for (const cb of this.listeners) cb(name);
  }

  /** 按 THEME_ORDER 循环切换，返回切换后的主题 */
  cycle(): ThemeName {
    const index = THEME_ORDER.indexOf(this.name);
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length];
    this.set(next);
    return next;
  }

  /** 同步 DOM 侧：CSS 变量按 html[data-theme] 分块生效 */
  applyDom(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = this.name;
    }
  }

  /** 订阅主题变更（main.ts 用来触发静止画面的重绘）；返回退订函数 */
  onChange(cb: (name: ThemeName) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
