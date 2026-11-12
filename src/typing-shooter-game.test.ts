import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TypingShooterGame,
  contentKindForLevel,
  computeShooterSpawnInterval,
  computeShooterFallSpeed,
  SHOOTER_CONTENT,
  BOSS_CONTENT,
  type ShooterSfx,
} from './typing-shooter-game.js';
import { lengthSpeedFactor } from './game-engine.js';
import type { ShooterState } from './types.js';

/** 测试子类：暴露状态与受保护方法，避免依赖 rAF/假计时器驱动循环 */
class TestShooter extends TypingShooterGame {
  get s(): ShooterState {
    return this.state;
  }
  forceRunning(): void {
    this.state.isRunning = true;
    this.state.countdown = 0;
  }
  spawn(): void {
    this.spawnTarget();
  }
  tick(now: number): void {
    this.update(now);
  }
}

function createMockCtx(): CanvasRenderingContext2D {
  const base = { measureText: (t: string) => ({ width: String(t).length * 10 }) };
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

/** 确定性随机源：恒取池内第一项、固定坐标 */
const zeroRng = () => 0;

function makeGame(onGameOver: (score: number) => void = () => {}) {
  return new TestShooter('test-canvas', () => {}, onGameOver, { rng: zeroRng });
}

/** 完整输入一个目标的文本 */
function typeFull(game: TestShooter, text: string): void {
  for (const ch of text) game.handleChar(ch);
}

describe('闯关射击纯函数', () => {
  it('contentKindForLevel 逐级递进：单字母→组合→简单→复杂→短语', () => {
    expect(contentKindForLevel(1)).toBe('letter');
    expect(contentKindForLevel(2)).toBe('combo');
    expect(contentKindForLevel(3)).toBe('simple');
    expect(contentKindForLevel(4)).toBe('simple');
    expect(contentKindForLevel(5)).toBe('complex');
    expect(contentKindForLevel(6)).toBe('complex');
    expect(contentKindForLevel(7)).toBe('phrase');
    expect(contentKindForLevel(20)).toBe('phrase');
  });

  it('computeShooterSpawnInterval 随等级缩短且有 1200ms 下限', () => {
    expect(computeShooterSpawnInterval(1)).toBe(2140);
    expect(computeShooterSpawnInterval(10)).toBe(1600);
    expect(computeShooterSpawnInterval(20)).toBe(1200);
  });
});

describe('TypingShooterGame', () => {
  beforeEach(() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'test-canvas';
    canvas.width = 800;
    canvas.height = 500;
    (canvas as unknown as { getContext: () => unknown }).getContext = () => createMockCtx();
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('第 1 关生成单字母目标，完整输入即击毁并累计连击/进度', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn();
    const text = game.s.targets[0].text;
    expect(SHOOTER_CONTENT.letter).toContain(text);
    expect(game.s.targets[0].kind).toBe('letter');

    typeFull(game, text);
    expect(game.s.targets).toEqual([]);
    expect(game.s.score).toBeGreaterThan(0);
    expect(game.s.combo).toBe(1);
    expect(game.s.maxCombo).toBe(1);
    expect(game.s.targetsClearedThisLevel).toBe(1);
  });

  it('错误字符计入失误并清零连击', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn();
    const text = game.s.targets[0].text;
    typeFull(game, text);
    expect(game.s.combo).toBe(1);

    game.spawn();
    // 输入一个与当前目标首字符不匹配的字符
    const wrong = game.s.targets[0].text[0] === 'z' ? 'q' : 'z';
    game.handleChar(wrong);
    expect(game.s.mistakes).toBe(1);
    expect(game.s.combo).toBe(0);
    expect(game.s.lastError?.char).toBe(wrong);
  });

  it('Backspace 回退已输入进度', () => {
    const game = makeGame();
    game.forceRunning();
    // 升到第 2 关以获得多字符目标
    game.s.level = 2;
    game.spawn();
    const combo = game.s.targets[0].text;
    expect(combo.length).toBeGreaterThan(1);
    game.handleChar(combo[0]);
    expect(game.s.targets[0].typedIndex).toBe(1);
    game.handleBackspace();
    expect(game.s.targets[0].typedIndex).toBe(0);
    expect(game.s.currentInput).toBe('');
  });

  it('BOSS 关最后一个目标为 BOSS，需三轮输入才击毁并触发升关', () => {
    const game = new TestShooter(
      'test-canvas',
      () => {},
      () => {},
      { rng: zeroRng, startingLevel: 4 }
    );
    game.forceRunning();

    // 先击毁 7 个普通目标
    for (let i = 0; i < 7; i++) {
      game.spawn();
      typeFull(game, game.s.targets[game.s.targets.length - 1].text);
    }
    expect(game.s.targetsClearedThisLevel).toBe(7);

    // 第 8 个应为 BOSS
    game.spawn();
    const boss = game.s.targets[game.s.targets.length - 1];
    expect(boss.kind).toBe('boss');
    expect(boss.hp).toBe(3);
    expect(BOSS_CONTENT).toContain(boss.text);

    // 第一轮：扣血但不击毁
    typeFull(game, boss.text);
    expect(game.s.targets.length).toBe(1);
    expect(game.s.targets[0].hp).toBe(2);
    expect(game.s.targets[0].typedIndex).toBe(0);

    // 第二轮
    typeFull(game, boss.text);
    expect(game.s.targets[0].hp).toBe(1);

    // 第三轮：击毁并升关
    typeFull(game, boss.text);
    expect(game.s.targets).toEqual([]);
    expect(game.s.level).toBe(5);
    expect(game.s.levelsCleared).toBe(1);
    expect(game.s.targetsClearedThisLevel).toBe(0);
  });

  it('目标触底扣命，命尽触发 onGameOver', () => {
    let overScore = -1;
    const game = makeGame((score) => {
      overScore = score;
    });
    game.forceRunning();

    for (let life = 5; life >= 1; life--) {
      game.spawn();
      game.s.targets[game.s.targets.length - 1].speed = 1000;
      game.tick(0);
      expect(game.s.lives).toBe(life - 1);
    }
    expect(game.isRunning()).toBe(false);
    expect(overScore).toBe(game.s.score);
  });

  it('BOSS 长句按长度减速，且词间空格可作为字符输入', () => {
    const game = makeGame();
    game.forceRunning();
    game.s.level = 4;
    game.s.targetsClearedThisLevel = 7; // 本关最后一个目标 → BOSS
    game.spawn();

    const boss = game.s.targets[game.s.targets.length - 1];
    expect(boss.kind).toBe('boss');
    expect(lengthSpeedFactor(boss.text)).toBeLessThan(1);
    expect(boss.speed).toBeCloseTo(computeShooterFallSpeed(4, 1, 0) * lengthSpeedFactor(boss.text));

    // 打到第一个词间空格：未锁定时 expectedChar 为 null，锁定后指向空格
    const spaceAt = boss.text.indexOf(' ');
    expect(game.expectedChar()).toBeNull();
    for (const ch of boss.text.slice(0, spaceAt)) game.handleChar(ch);
    expect(game.expectedChar()).toBe(' ');

    game.handleChar(' ');
    expect(boss.typedIndex).toBe(spaceAt + 1);
    expect(game.expectedChar()).toBe(boss.text[spaceAt + 1].toLowerCase());
  });

  describe('音效钩子（onSfx）', () => {
    function makeSfxGame(startingLevel = 2) {
      const played: ShooterSfx[] = [];
      const game = new TestShooter(
        'test-canvas',
        () => {},
        () => {},
        {
          rng: zeroRng,
          startingLevel,
          onSfx: (name) => played.push(name),
        }
      );
      game.forceRunning();
      return { game, played };
    }

    it('正确字符发 shoot、错误字符发 error、击毁目标发 destroy', () => {
      const { game, played } = makeSfxGame(2);
      game.spawn();
      const text = game.s.targets[0].text;
      expect(text.length).toBeGreaterThan(1);

      game.handleChar(text[0]);
      expect(played).toContain('shoot');

      const wrong = text[1] === 'z' ? 'q' : 'z';
      game.handleChar(wrong);
      expect(played).toContain('error');

      typeFull(game, text.slice(1));
      expect(played).toContain('destroy');
      expect(game.s.targets).toEqual([]);
    });

    it('BOSS 出现发 boss、破甲发 hit、升关发 levelup', () => {
      const { game, played } = makeSfxGame(4);
      game.s.targetsClearedThisLevel = 7; // 本关最后一个目标 → BOSS
      game.spawn();
      expect(played).toContain('boss');

      const boss = game.s.targets[game.s.targets.length - 1];
      typeFull(game, boss.text);
      expect(played).toContain('hit'); // 破甲（hp 3→2）

      typeFull(game, boss.text);
      typeFull(game, boss.text);
      expect(played).toContain('destroy');
      expect(played).toContain('levelup');
      expect(game.s.level).toBe(5);
    });

    it('目标触底发 hurt，命尽发 gameover', () => {
      const { game, played } = makeSfxGame(1);
      for (let i = 0; i < 5; i++) {
        game.spawn();
        game.s.targets[game.s.targets.length - 1].speed = 1000;
        game.tick(0);
      }
      expect(played.filter((n) => n === 'hurt')).toHaveLength(5);
      expect(played).toContain('gameover');
      expect(game.isRunning()).toBe(false);
    });
  });
});
