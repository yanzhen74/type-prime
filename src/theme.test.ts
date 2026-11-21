import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  THEMES,
  THEME_ORDER,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  ThemeManager,
  alpha,
  isThemeName,
  loadStoredTheme,
  type CanvasPalette,
  type ThemeName,
} from './theme.js';
import { FallingWordGame } from './game.js';
import { TypingShooterGame } from './typing-shooter-game.js';
import { ZombieTypingGame } from './zombie-typing-game.js';

/** CanvasPalette 的全部 token（新增 token 时此表同步，保证三主题不漏配） */
const PALETTE_TOKENS: (keyof CanvasPalette)[] = [
  'board',
  'grid',
  'ink',
  'muted',
  'accent',
  'accentSoft',
  'success',
  'danger',
  'dangerHot',
  'dangerSoft',
  'warn',
  'onAccent',
  'scrim',
  'scrimHeavy',
  'shadow',
  'handLeft',
  'handRight',
];

describe('主题表与取色工具', () => {
  it('三套主题齐全：顺序、标签与 token 集合一致且均为非空字符串', () => {
    expect(THEME_ORDER).toEqual(['night', 'paper', 'phosphor']);
    expect(DEFAULT_THEME).toBe('night');
    for (const name of THEME_ORDER) {
      const def = THEMES[name];
      expect(def.label).toBe(THEME_LABELS[name]);
      expect(Object.keys(def.canvas).sort()).toEqual([...PALETTE_TOKENS].sort());
      for (const token of PALETTE_TOKENS) {
        expect(typeof def.canvas[token]).toBe('string');
        expect(def.canvas[token].length).toBeGreaterThan(0);
      }
    }
  });

  it('三主题版面色互不相同：底色/主文字/强调色在两两之间都可辨识', () => {
    for (const token of ['board', 'ink', 'accent', 'grid'] as const) {
      const values = THEME_ORDER.map((name) => THEMES[name].canvas[token]);
      expect(new Set(values).size).toBe(THEME_ORDER.length);
    }
  });

  it('纸墨白为浅底深字，深空夜与磷光绿为深底浅字（遮罩方向随之相反）', () => {
    expect(THEMES.paper.canvas.board).toBe('#fbf7ee');
    expect(THEMES.paper.canvas.ink).toBe('#1c2431');
    expect(THEMES.paper.canvas.scrim).toContain('255, 253, 247');
    expect(THEMES.night.canvas.scrim).toContain('15, 23, 42');
    expect(THEMES.phosphor.canvas.scrim).toContain('2, 10, 5');
  });

  it('alpha 把 #rrggbb 转 rgba，并钳制透明度到 [0,1]', () => {
    expect(alpha('#38bdf8', 0.35)).toBe('rgba(56, 189, 248, 0.35)');
    expect(alpha('#020617', 1)).toBe('rgba(2, 6, 23, 1)');
    expect(alpha('#FFFFFF', 0)).toBe('rgba(255, 255, 255, 0)');
    expect(alpha('#f43f5e', 2)).toBe('rgba(244, 63, 94, 1)');
    expect(alpha('#f43f5e', -1)).toBe('rgba(244, 63, 94, 0)');
  });

  it('alpha 对非 hex 输入原样返回（已是 rgba 的遮罩色不被二次包裹）', () => {
    expect(alpha('rgba(15, 23, 42, 0.85)', 0.5)).toBe('rgba(15, 23, 42, 0.85)');
    expect(alpha('#fff', 0.5)).toBe('#fff');
    expect(alpha('', 0.5)).toBe('');
  });

  it('isThemeName 只接受三个主题名', () => {
    expect(isThemeName('night')).toBe(true);
    expect(isThemeName('paper')).toBe(true);
    expect(isThemeName('phosphor')).toBe(true);
    expect(isThemeName('dark')).toBe(false);
    expect(isThemeName('')).toBe(false);
    expect(isThemeName(null)).toBe(false);
    expect(isThemeName(6)).toBe(false);
  });
});

describe('loadStoredTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('存储缺失时回退默认主题', () => {
    expect(loadStoredTheme()).toBe(DEFAULT_THEME);
  });

  it('读回合法主题', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'phosphor');
    expect(loadStoredTheme()).toBe('phosphor');
  });

  it('损坏/未知值回退默认主题', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(loadStoredTheme()).toBe(DEFAULT_THEME);
    localStorage.setItem(THEME_STORAGE_KEY, '{"theme":"paper"}');
    expect(loadStoredTheme()).toBe(DEFAULT_THEME);
  });

  it('存储不可用（隐私模式抛错）时回退默认主题', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadStoredTheme()).toBe(DEFAULT_THEME);
  });
});

describe('ThemeManager', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.theme;
  });

  it('默认深空夜；构造参数可覆盖存储值', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'paper');
    expect(new ThemeManager().current).toBe('paper');
    expect(new ThemeManager('phosphor').current).toBe('phosphor');
  });

  it('set 持久化 + 同步 html[data-theme] + 通知订阅者', () => {
    const manager = new ThemeManager('night');
    const seen: ThemeName[] = [];
    manager.onChange((name) => seen.push(name));

    manager.set('paper');

    expect(manager.current).toBe('paper');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('paper');
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(seen).toEqual(['paper']);
    expect(manager.palette()).toBe(THEMES.paper.canvas);
  });

  it('同值 set 早退：不重复通知、不重复写存储', () => {
    const manager = new ThemeManager('paper');
    const seen: ThemeName[] = [];
    manager.onChange((name) => seen.push(name));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    manager.set('paper');

    expect(seen).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('cycle 按 night → paper → phosphor → night 循环并返回新主题', () => {
    const manager = new ThemeManager('night');
    expect(manager.cycle()).toBe('paper');
    expect(manager.cycle()).toBe('phosphor');
    expect(manager.cycle()).toBe('night');
    expect(manager.current).toBe('night');
  });

  it('provider 是活取色函数：切换后无需重建实例即可拿到新色', () => {
    const manager = new ThemeManager('night');
    const getPalette = manager.provider();
    expect(getPalette().board).toBe(THEMES.night.canvas.board);

    manager.set('phosphor');

    expect(getPalette().board).toBe(THEMES.phosphor.canvas.board);
    expect(getPalette().ink).toBe(THEMES.phosphor.canvas.ink);
  });

  it('onChange 返回退订函数，退订后不再收到通知', () => {
    const manager = new ThemeManager('night');
    const seen: ThemeName[] = [];
    const off = manager.onChange((name) => seen.push(name));
    manager.set('paper');
    off();
    manager.set('phosphor');
    expect(seen).toEqual(['paper']);
  });

  it('存储不可用时仅内存生效：不抛错且仍换肤与通知', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const manager = new ThemeManager('night');
    const seen: ThemeName[] = [];
    manager.onChange((name) => seen.push(name));

    expect(() => manager.set('paper')).not.toThrow();
    expect(manager.current).toBe('paper');
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(seen).toEqual(['paper']);
  });

  it('applyDom 幂等：重复调用只写当前主题', () => {
    const manager = new ThemeManager('phosphor');
    manager.applyDom();
    manager.applyDom();
    expect(document.documentElement.dataset.theme).toBe('phosphor');
  });
});

/** 记录版面色写入的 2D 上下文桩：其余方法一律 no-op */
function createRecordingCtx(): { ctx: CanvasRenderingContext2D; colors: string[] } {
  const colors: string[] = [];
  const base = { measureText: () => ({ width: 10 }) };
  const ctx = new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return (target as Record<string | symbol, unknown>)[prop];
      }
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
  return { ctx, colors };
}

/** 挂载 #game-canvas 并返回颜色记录数组 */
function mountCanvas(): string[] {
  const { ctx, colors } = createRecordingCtx();
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.width = 800;
  canvas.height = 500;
  (canvas as unknown as { getContext: () => unknown }).getContext = () => ctx;
  document.body.appendChild(canvas);
  return colors;
}

describe('Canvas 取色接线（三游戏 redraw）', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('注入纸墨白调色板后，单词掉落绘制使用对应版面色而非深空夜', () => {
    const colors = mountCanvas();
    const game = new FallingWordGame(
      'game-canvas',
      () => {},
      () => {},
      {
        getPalette: () => THEMES.paper.canvas,
      }
    );

    game.redraw();

    expect(colors).toContain(THEMES.paper.canvas.grid);
    expect(colors).toContain(THEMES.paper.canvas.danger);
    expect(colors).not.toContain(THEMES.night.canvas.grid);
    expect(colors).not.toContain(THEMES.night.canvas.danger);
  });

  it('未注入取色函数时回退深空夜（独立运行/测试默认行为不变）', () => {
    const colors = mountCanvas();
    const game = new FallingWordGame(
      'game-canvas',
      () => {},
      () => {}
    );

    game.redraw();

    expect(colors).toContain(THEMES.night.canvas.grid);
    expect(colors).toContain(THEMES.night.canvas.danger);
  });

  it('闯关射击与僵尸大战同样跟随注入的调色板', () => {
    const shooterColors = mountCanvas();
    const shooter = new TypingShooterGame(
      'game-canvas',
      () => {},
      () => {},
      {
        getPalette: () => THEMES.phosphor.canvas,
      }
    );
    shooter.redraw();
    expect(shooterColors).toContain(THEMES.phosphor.canvas.grid);
    expect(shooterColors).not.toContain(THEMES.night.canvas.grid);

    document.body.replaceChildren();
    const zombieColors = mountCanvas();
    const zombie = new ZombieTypingGame(
      'game-canvas',
      () => {},
      () => {},
      {
        getPalette: () => THEMES.paper.canvas,
      }
    );
    zombie.redraw();
    expect(zombieColors).toContain(THEMES.paper.canvas.grid);
    expect(zombieColors).toContain(THEMES.paper.canvas.success);
    expect(zombieColors).not.toContain(THEMES.night.canvas.grid);
  });

  it('取色函数返回值变化后 redraw 即换色，无需重建实例', () => {
    const colors = mountCanvas();
    let current: CanvasPalette = THEMES.night.canvas;
    const game = new FallingWordGame(
      'game-canvas',
      () => {},
      () => {},
      {
        getPalette: () => current,
      }
    );

    game.redraw();
    expect(colors).toContain(THEMES.night.canvas.grid);

    current = THEMES.paper.canvas;
    colors.length = 0;
    game.redraw();

    expect(colors).toContain(THEMES.paper.canvas.grid);
    expect(colors).not.toContain(THEMES.night.canvas.grid);
  });
});
