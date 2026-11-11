import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ZombieTypingGame,
  waveComposition,
  computeZombieSpawnInterval,
  computeZombieSpeed,
  headBarFraction,
  zombieBarColor,
  ZOMBIE_HP,
  ZOMBIE_WORDS,
} from './zombie-typing-game.js';
import type { ZombieKind, ZombieState } from './types.js';

/** 测试子类：暴露状态与受保护方法，避免依赖 rAF/假计时器 */
class TestZombie extends ZombieTypingGame {
  get s(): ZombieState {
    return this.state;
  }
  forceRunning(): void {
    this.state.isRunning = true;
    this.state.countdown = 0;
  }
  spawn(kind: ZombieKind): void {
    this.spawnZombie(kind);
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

const zeroRng = () => 0;

function makeGame(onGameOver: (score: number) => void = () => {}) {
  return new TestZombie('test-canvas', () => {}, onGameOver, { rng: zeroRng });
}

function typeFull(game: TestZombie, text: string): void {
  for (const ch of text) game.handleChar(ch);
}

describe('僵尸大战纯函数', () => {
  it('waveComposition 按波次递进加入快速/坦克/BOSS', () => {
    const w1 = waveComposition(1);
    expect(w1).toHaveLength(5);
    expect(w1.every((k) => k === 'normal')).toBe(true);

    const w2 = waveComposition(2);
    expect(w2).toHaveLength(6);
    expect(w2.filter((k) => k === 'fast')).toHaveLength(1);

    const w4 = waveComposition(4);
    expect(w4).toHaveLength(8);
    expect(w4.filter((k) => k === 'boss')).toHaveLength(1);
    expect(w4.filter((k) => k === 'tank')).toHaveLength(1);
    expect(w4.filter((k) => k === 'fast')).toHaveLength(2);
  });

  it('computeZombieSpawnInterval 随波次缩短且有 900ms 下限', () => {
    expect(computeZombieSpawnInterval(1)).toBe(1740);
    expect(computeZombieSpawnInterval(20)).toBe(900);
  });

  it('computeZombieSpeed 快速僵尸快于普通、坦克最慢', () => {
    const f = (k: ZombieKind) => computeZombieSpeed(k, 1, 1, 0);
    expect(f('fast')).toBeGreaterThan(f('normal'));
    expect(f('normal')).toBeGreaterThan(f('tank'));
    expect(f('tank')).toBeGreaterThan(f('boss'));
  });
});

describe('ZombieTypingGame', () => {
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

  it('完整输入消灭普通僵尸并累计击杀/得分', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('normal');
    const text = game.s.zombies[0].text;
    expect(ZOMBIE_WORDS.normal).toContain(text);

    typeFull(game, text);
    expect(game.s.zombies).toEqual([]);
    expect(game.s.kills).toBe(1);
    expect(game.s.score).toBeGreaterThan(0);
  });

  it('坦克僵尸需三轮输入才消灭', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('tank');
    const text = game.s.zombies[0].text;

    typeFull(game, text);
    expect(game.s.zombies).toHaveLength(1);
    expect(game.s.zombies[0].hp).toBe(2);
    expect(game.s.zombies[0].typedIndex).toBe(0);

    typeFull(game, text);
    expect(game.s.zombies[0].hp).toBe(1);

    typeFull(game, text);
    expect(game.s.zombies).toEqual([]);
    expect(game.s.kills).toBe(1);
  });

  it('僵尸触底按类型扣基地血量', () => {
    const game = makeGame();
    game.forceRunning();
    const before = game.s.lives;

    game.spawn('normal');
    game.s.zombies[0].speed = 1000;
    game.tick(0);
    expect(game.s.lives).toBe(before - 1);

    game.spawn('boss');
    game.s.zombies[0].speed = 1000;
    game.tick(0);
    expect(game.s.lives).toBe(before - 1 - 3);
  });

  it('本波最后一只僵尸触底后仍推进波次（不卡住不出怪）', () => {
    const game = makeGame();
    game.forceRunning();
    game.s.waveQueue = [];
    game.spawn('normal');
    game.s.zombies[0].speed = 1000;
    game.tick(0);

    expect(game.s.zombies).toEqual([]);
    expect(game.s.wavesCleared).toBe(1);
    expect(game.s.level).toBe(2);
    expect(game.s.waveQueue).toEqual(waveComposition(2));
  });

  it('击杀掉落修复道具时回补基地血量并计数', () => {
    const game = makeGame();
    game.forceRunning();
    game.s.lives = 5; // rng=0 恒掉落首个道具=heal
    game.spawn('normal');
    typeFull(game, game.s.zombies[0].text);
    expect(game.s.items).toBe(1);
    expect(game.s.lives).toBe(6);
  });

  it('清空本波僵尸后推进波次并重建队列', () => {
    const game = makeGame();
    game.forceRunning();
    game.s.waveQueue = [];
    game.spawn('normal');
    typeFull(game, game.s.zombies[0].text);

    expect(game.s.wavesCleared).toBe(1);
    expect(game.s.level).toBe(2);
    expect(game.s.waveQueue).toEqual(waveComposition(2));
  });

  it('坚守满 8 波判定防守成功并触发 onGameOver', () => {
    let over = -1;
    const game = makeGame((score) => {
      over = score;
    });
    game.forceRunning();
    game.s.wavesCleared = 7;
    game.s.waveQueue = [];
    game.spawn('normal');
    typeFull(game, game.s.zombies[0].text);

    expect(game.s.victory).toBe(true);
    expect(game.isRunning()).toBe(false);
    expect(over).toBe(game.s.score);
  });

  it('每正确字符发射一枚实弹', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('normal');
    game.handleChar(game.s.zombies[0].text[0]);

    expect(game.s.projectiles).toHaveLength(1);
    expect(game.s.projectiles[0].miss).toBeFalsy();
    expect(game.s.projectiles[0].targetId).toBe(game.s.zombies[0].id);
  });

  it('炮弹命中后 shownChars 增、头部血条比例下降', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('normal');
    game.tick(0);
    game.handleChar(game.s.zombies[0].text[0]);
    game.tick(0);
    game.tick(1000); // 大 dt 保证飞抵目标

    const z = game.s.zombies[0];
    expect(z.shownChars).toBe(1);
    expect(headBarFraction(z)).toBeLessThan(1);
  });

  it('坦克血条三段变色（蓝/黄/红），其余类型红', () => {
    expect(zombieBarColor('tank', 3)).toBe('#38bdf8');
    expect(zombieBarColor('tank', 2)).toBe('#facc15');
    expect(zombieBarColor('tank', 1)).toBe('#ef4444');
    expect(zombieBarColor('normal', 1)).toBe('#ef4444');
    expect(zombieBarColor('boss', 5)).toBe('#ef4444');
  });

  it('目标被击杀后在飞实弹 fizzle 移除', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('normal');
    const word = game.s.zombies[0].text;

    game.handleChar(word[0]); // 产生一枚在飞实弹
    typeFull(game, word.slice(1)); // 打完剩余字符击杀
    expect(game.s.zombies).toEqual([]);

    game.tick(0);
    game.tick(1000);
    expect(game.s.projectiles).toEqual([]);
  });

  it('打错字符发射 miss 哑弹：零伤害，跳弹后落地移除并飘 ✗错字符', () => {
    const game = makeGame();
    game.forceRunning();
    game.spawn('normal');
    const word = game.s.zombies[0].text;
    game.handleChar(word[0]); // 先锁定目标（同时发出一枚实弹）
    const wrong = word[1] === 'z' ? 'y' : 'z';

    game.handleChar(wrong);
    expect(game.s.projectiles).toHaveLength(2);
    const dud = game.s.projectiles[1];
    expect(dud.miss).toBe(true);
    expect(dud.char).toBe(wrong);
    expect(dud.targetId).toBe(game.s.zombies[0].id);

    game.tick(0);
    game.tick(1000); // 实弹命中、哑弹接触跳弹
    expect(game.s.zombies[0].shownChars).toBe(1);
    expect(game.s.zombies[0].hp).toBe(ZOMBIE_HP.normal); // 哑弹零伤害
    expect(game.s.effects.some((e) => e.text === `✗${wrong}`)).toBe(true);

    game.tick(2000); // 跳弹下坠 / 超 TTL 后 splat 移除
    expect(game.s.projectiles).toEqual([]);
  });

  it('无锁定目标时打错仍发射哑弹并安全落空', () => {
    const game = makeGame();
    game.forceRunning();

    game.handleChar('a');
    expect(game.s.projectiles).toHaveLength(1);
    expect(game.s.projectiles[0].targetId).toBe(-1);
    expect(game.s.mistakes).toBe(1);

    game.tick(0);
    game.tick(1000);
    game.tick(2000);
    expect(game.s.projectiles).toEqual([]);
  });
});
