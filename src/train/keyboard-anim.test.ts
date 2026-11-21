import { describe, it, expect } from 'vitest';
import {
  KEY_ANIM,
  KeyboardAnimator,
  MAX_KEY_ANIM_STEP,
  MAX_KEY_RIPPLES,
  PRESS_TOTAL_MS,
  clamp01,
  easeOutBack,
  easeOutCubic,
  errorEnvelope,
  pressEnvelope,
} from './keyboard-anim.js';

/**
 * 键盘动画状态机单测。
 *
 * 全部用合成时间驱动：首帧 update(0) 的 dt 为哨兵 0，其后按注入步长推进，
 * 因此每个通道的位置都可精确断言（不依赖 performance.now / rAF）。
 */

/** 建一个从 0 起步的合成时钟，返回按 delta 推进的 tick */
function makeClock(anim: KeyboardAnimator): (delta: number) => void {
  let now = 0;
  anim.update(now);
  return (delta: number) => {
    now += delta;
    anim.update(now);
  };
}

/** 按不超过单帧上限的步长累计推进 ms 毫秒 */
function advance(tick: (delta: number) => void, ms: number): void {
  let left = ms;
  while (left > 0) {
    const step = Math.min(MAX_KEY_ANIM_STEP, left);
    tick(step);
    left -= step;
  }
}

const IDLE = { dy: 0, scale: 1, shake: 0, press: 0, error: 0, hint: 0, layer: 0, glow: 0 };

describe('缓动与包络纯函数', () => {
  it('clamp01 钳制上下界并保留中间值', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(9)).toBe(1);
  });

  it('easeOutCubic 端点为 0/1 且单调递增', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.3)).toBeLessThan(easeOutCubic(0.6));
  });

  it('easeOutBack 端点为 0/1，中途过冲越过 1（回弹感来源）', () => {
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBe(1);
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });

  it('pressEnvelope 起点静止、下压段末端到位', () => {
    expect(pressEnvelope(0)).toEqual({ dy: 0, scale: 1, intensity: 0 });
    const down = pressEnvelope(KEY_ANIM.press.downMs);
    expect(down.dy).toBeCloseTo(KEY_ANIM.press.travel, 6);
    expect(down.scale).toBeCloseTo(1 - KEY_ANIM.press.squash, 6);
    expect(down.intensity).toBeCloseTo(1, 6);
  });

  it('pressEnvelope 回弹段末端回到静止位且强度归零', () => {
    const end = pressEnvelope(PRESS_TOTAL_MS);
    expect(end.dy).toBeCloseTo(0, 6);
    expect(end.scale).toBeCloseTo(1, 6);
    expect(end.intensity).toBeCloseTo(0, 6);
  });

  it('pressEnvelope 回弹中途短暂上浮（dy 为负）', () => {
    const mid = pressEnvelope(KEY_ANIM.press.downMs + KEY_ANIM.press.upMs * 0.7);
    expect(mid.dy).toBeLessThan(0);
    expect(mid.scale).toBeGreaterThan(1);
  });

  it('errorEnvelope 起点与终点均为零', () => {
    expect(errorEnvelope(0)).toEqual({ shake: 0, intensity: 0 });
    const end = errorEnvelope(KEY_ANIM.error.ms);
    expect(end.shake).toBeCloseTo(0, 6);
    expect(end.intensity).toBeCloseTo(0, 6);
  });

  it('errorEnvelope 红色快攻击：攻击段末已接近满强度', () => {
    expect(errorEnvelope(KEY_ANIM.error.attackMs).intensity).toBeGreaterThan(0.9);
  });

  it('errorEnvelope 抖动方向会反转（衰减正弦）', () => {
    const period = KEY_ANIM.error.ms / KEY_ANIM.error.shakeCycles;
    expect(errorEnvelope(period / 4).shake).toBeGreaterThan(0);
    expect(errorEnvelope((period * 3) / 4).shake).toBeLessThan(0);
  });
});

describe('帧内计时不变量', () => {
  it('首帧 dt 为哨兵 0：update(0) 不推进任何通道', () => {
    const anim = new KeyboardAnimator();
    anim.press('KeyA');
    anim.update(0);
    expect(anim.visual('KeyA').press).toBe(0);
    expect(anim.visual('KeyA').dy).toBe(0);
  });

  it('按注入 dt 推进：下压段末端恰好到位', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.press('KeyA');
    advance(tick, KEY_ANIM.press.downMs);
    expect(anim.visual('KeyA').dy).toBeCloseTo(KEY_ANIM.press.travel, 6);
  });

  it('单帧步长上限吸收巨大 dt，键帽不会瞬移', () => {
    const anim = new KeyboardAnimator();
    anim.update(0);
    anim.press('KeyA');
    anim.update(100000);
    const v = anim.visual('KeyA');
    expect(v.dy).toBeLessThan(KEY_ANIM.press.travel);
    expect(v.press).toBeGreaterThan(0);
    expect(v.press).toBeLessThan(1);
  });

  it('时间回退（dt 为负）不推进通道', () => {
    const anim = new KeyboardAnimator();
    anim.update(1000);
    anim.press('KeyA');
    anim.update(500);
    expect(anim.visual('KeyA').press).toBe(0);
  });

  it('动画落定后通道被清除，active 转 false（无引导时循环可停）', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.press('KeyA');
    expect(anim.active).toBe(true);
    advance(tick, PRESS_TOTAL_MS + KEY_ANIM.ripple.ms);
    expect(anim.visual('KeyA')).toEqual(IDLE);
    expect(anim.rippleList).toHaveLength(0);
    expect(anim.active).toBe(false);
  });

  it('visual 每次返回新对象，调用方改写不污染内部状态', () => {
    const anim = new KeyboardAnimator();
    anim.setLayer(['KeyA']);
    const v = anim.visual('KeyA');
    v.layer = 99;
    expect(anim.visual('KeyA').layer).not.toBe(99);
  });
});

describe('按下与错键的互斥和优先级', () => {
  it('同键先 press 后 pressError：错键优先且按下通道被清空', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.press('KeyA');
    advance(tick, 30);
    anim.pressError('KeyA');
    advance(tick, 20);
    const v = anim.visual('KeyA');
    expect(v.error).toBeGreaterThan(0);
    expect(v.press).toBe(0);
    expect(v.shake).not.toBe(0);
  });

  it('同键先 pressError 后 press：按下生效且错键通道被清空', () => {
    const anim = new KeyboardAnimator();
    anim.pressError('KeyA');
    anim.press('KeyA');
    const v = anim.visual('KeyA');
    expect(v.error).toBe(0);
    expect(v.shake).toBe(0);
    expect(v.dy).toBe(0); // 年龄 0，尚未下沉
    expect(anim.rippleList.map((r) => r.kind)).toEqual(['error', 'press']);
  });

  it('错键优先于下一键引导', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyA');
    advance(tick, 750);
    anim.pressError('KeyA');
    advance(tick, 20);
    const v = anim.visual('KeyA');
    expect(v.error).toBeGreaterThan(0);
    expect(v.hint).toBe(0);
  });

  it('按下优先于下一键引导', () => {
    const anim = new KeyboardAnimator();
    anim.setHint('KeyA');
    anim.press('KeyA');
    const v = anim.visual('KeyA');
    expect(v.hint).toBe(0);
    expect(v.scale).toBe(1); // 年龄 0
  });

  it('重复 press 同键会重置年龄（连击时重新起播）', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.press('KeyA');
    advance(tick, KEY_ANIM.press.downMs);
    expect(anim.visual('KeyA').dy).toBeCloseTo(KEY_ANIM.press.travel, 6);
    anim.press('KeyA');
    expect(anim.visual('KeyA').dy).toBe(0);
  });
});

describe('下一键呼吸引导', () => {
  it('存在引导即保持 active（呼吸是持续动画）', () => {
    const anim = new KeyboardAnimator();
    expect(anim.active).toBe(false);
    anim.setHint('KeyF');
    expect(anim.active).toBe(true);
  });

  it('呼吸按周期起伏：半周期最亮、整周期回到最暗', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    expect(anim.visual('KeyF').hint).toBe(0);
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    expect(anim.visual('KeyF').hint).toBeCloseTo(1, 6);
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    expect(anim.visual('KeyF').hint).toBeCloseTo(0, 6);
  });

  it('呼吸最亮时键帽上浮且发光达到上限', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    const v = anim.visual('KeyF');
    expect(v.dy).toBeCloseTo(-KEY_ANIM.hint.lift, 6);
    expect(v.glow).toBeCloseTo(KEY_ANIM.hint.glowMax, 6);
  });

  it('发光半径始终落在上下限之间', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    for (let i = 0; i < 40; i++) {
      advance(tick, 40);
      const glow = anim.visual('KeyF').glow;
      expect(glow).toBeGreaterThanOrEqual(KEY_ANIM.hint.glowMin);
      expect(glow).toBeLessThanOrEqual(KEY_ANIM.hint.glowMax);
    }
  });

  it('setHint 同值早退，不重置呼吸相位', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    anim.setHint('KeyF');
    expect(anim.visual('KeyF').hint).toBeCloseTo(1, 6);
  });

  it('换键时呼吸相位归零', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    anim.setHint('KeyJ');
    expect(anim.visual('KeyJ').hint).toBe(0);
    expect(anim.visual('KeyF').hint).toBe(0);
    expect(anim.hint).toBe('KeyJ');
  });

  it('清空引导后若无瞬时通道则 active 转 false', () => {
    const anim = new KeyboardAnimator();
    anim.setHint('KeyF');
    anim.setHint(null);
    expect(anim.active).toBe(false);
    expect(anim.hint).toBeNull();
  });
});

describe('层级高亮渐入与错峰', () => {
  it('新纳入的键按传入顺序错峰渐入', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA', 'KeyS', 'KeyD']);
    advance(tick, 100);
    const a = anim.visual('KeyA').layer;
    const s = anim.visual('KeyS').layer;
    const d = anim.visual('KeyD').layer;
    expect(a).toBeGreaterThan(s);
    expect(s).toBeGreaterThan(d);
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it('错峰间隔取自参数表', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA', 'KeyS']);
    // 第二个键延迟 22ms：推进 20ms 时它仍未起渐入
    advance(tick, 20);
    expect(anim.visual('KeyS').layer).toBe(0);
    expect(anim.visual('KeyA').layer).toBeGreaterThan(0);
  });

  it('渐入完成后定格为 1 且不再占用帧循环', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA', 'KeyS']);
    advance(tick, KEY_ANIM.layer.staggerMs + KEY_ANIM.layer.inMs + 20);
    expect(anim.visual('KeyA').layer).toBe(1);
    expect(anim.visual('KeyS').layer).toBe(1);
    expect(anim.active).toBe(false);
  });

  it('移出的键渐出到 0', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA']);
    advance(tick, KEY_ANIM.layer.inMs + 20);
    anim.setLayer([]);
    expect(anim.active).toBe(true);
    advance(tick, KEY_ANIM.layer.outMs + 20);
    expect(anim.visual('KeyA').layer).toBe(0);
    expect(anim.active).toBe(false);
  });

  it('同一组键重复设置不重启动画', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA', 'KeyS']);
    advance(tick, 400);
    expect(anim.active).toBe(false);
    anim.setLayer(['KeyS', 'KeyA']); // 顺序不同但集合相同
    expect(anim.active).toBe(false);
    expect(anim.visual('KeyA').layer).toBe(1);
  });

  it('部分重叠切换：保留键不重新渐入，新键从 0 起，旧键渐出', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA', 'KeyS']);
    advance(tick, 400);
    anim.setLayer(['KeyS', 'KeyD']);
    expect(anim.visual('KeyS').layer).toBe(1);
    expect(anim.visual('KeyD').layer).toBe(0);
    advance(tick, 400);
    expect(anim.visual('KeyA').layer).toBe(0);
    expect(anim.visual('KeyS').layer).toBe(1);
    expect(anim.visual('KeyD').layer).toBe(1);
  });
});

describe('击键涟漪', () => {
  it('press 与 pressError 分别产生对应类型的涟漪', () => {
    const anim = new KeyboardAnimator();
    anim.press('KeyA');
    anim.pressError('KeyS');
    expect(anim.rippleList.map((r) => [r.code, r.kind])).toEqual([
      ['KeyA', 'press'],
      ['KeyS', 'error'],
    ]);
    expect(anim.rippleList[0].ttl).toBe(KEY_ANIM.ripple.ms);
  });

  it('涟漪按注入 dt 老化并在寿命到期后移除', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.press('KeyA');
    advance(tick, KEY_ANIM.ripple.ms - 10);
    expect(anim.rippleList).toHaveLength(1);
    expect(anim.rippleList[0].age).toBe(KEY_ANIM.ripple.ms - 10);
    advance(tick, 20);
    expect(anim.rippleList).toHaveLength(0);
  });

  it('超过上限时丢弃最老的涟漪（快速连击不无限增长）', () => {
    const anim = new KeyboardAnimator();
    for (let i = 0; i < MAX_KEY_RIPPLES + 3; i++) {
      anim.press(`Key${String.fromCharCode(65 + i)}`);
    }
    expect(anim.rippleList).toHaveLength(MAX_KEY_RIPPLES);
    expect(anim.rippleList[0].code).toBe('KeyD');
  });
});

describe('降级模式（关闭动画 / 系统减少动态效果）', () => {
  it('按下只保留色块停留，无位移无缩放无发光', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    anim.press('KeyA');
    expect(anim.visual('KeyA')).toEqual({ ...IDLE, press: 1 });
  });

  it('错键只保留色块停留，无抖动', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    anim.pressError('KeyA');
    expect(anim.visual('KeyA')).toEqual({ ...IDLE, error: 1 });
  });

  it('不产生涟漪', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    anim.press('KeyA');
    anim.pressError('KeyS');
    expect(anim.rippleList).toHaveLength(0);
  });

  it('色块停留到设定时长后清除，active 随之转 false', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    const tick = makeClock(anim);
    anim.press('KeyA');
    anim.pressError('KeyS');
    expect(anim.active).toBe(true);
    advance(tick, KEY_ANIM.reduced.pressHoldMs);
    expect(anim.visual('KeyA').press).toBe(0);
    expect(anim.visual('KeyS').error).toBe(1);
    advance(tick, KEY_ANIM.reduced.errorHoldMs);
    expect(anim.visual('KeyS').error).toBe(0);
    expect(anim.active).toBe(false);
  });

  it('引导不呼吸：固定浓度且无位移，不占用帧循环', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    advance(tick, KEY_ANIM.hint.periodMs / 2);
    expect(anim.visual('KeyF')).toEqual({ ...IDLE, hint: KEY_ANIM.reduced.hintFill });
    expect(anim.active).toBe(false);
  });

  it('层级高亮立即到位，不做渐入', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    anim.setLayer(['KeyA', 'KeyS']);
    expect(anim.visual('KeyA').layer).toBe(1);
    expect(anim.visual('KeyS').layer).toBe(1);
    expect(anim.active).toBe(false);
  });

  it('运行中切到降级：在飞补间立即定格、涟漪清空、位移归零', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setLayer(['KeyA']);
    anim.press('KeyS');
    advance(tick, 100);
    expect(anim.visual('KeyA').layer).toBeGreaterThan(0);
    expect(anim.visual('KeyA').layer).toBeLessThan(1);
    expect(anim.rippleList.length).toBeGreaterThan(0);

    anim.setReducedMotion(true);
    expect(anim.reducedMotion).toBe(true);
    expect(anim.visual('KeyA').layer).toBe(1);
    expect(anim.rippleList).toHaveLength(0);
    expect(anim.visual('KeyS').dy).toBe(0);
    expect(anim.visual('KeyS').scale).toBe(1);
  });

  it('切回正常模式后恢复位移与涟漪', () => {
    const anim = new KeyboardAnimator({ reducedMotion: true });
    anim.setReducedMotion(false);
    anim.press('KeyA');
    expect(anim.rippleList).toHaveLength(1);
    const tick = makeClock(anim);
    advance(tick, KEY_ANIM.press.downMs);
    expect(anim.visual('KeyA').dy).toBeCloseTo(KEY_ANIM.press.travel, 6);
  });

  it('同值设置降级模式早退，不清掉正在飞的涟漪', () => {
    const anim = new KeyboardAnimator();
    anim.press('KeyA');
    anim.setReducedMotion(false);
    expect(anim.rippleList).toHaveLength(1);
  });
});

describe('reset', () => {
  it('清空全部通道与引导', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    anim.setHint('KeyF');
    anim.setLayer(['KeyA']);
    anim.press('KeyS');
    anim.pressError('KeyD');
    advance(tick, 100);
    anim.reset();
    expect(anim.hint).toBeNull();
    expect(anim.rippleList).toHaveLength(0);
    expect(anim.active).toBe(false);
    expect(anim.visual('KeyA')).toEqual(IDLE);
    expect(anim.visual('KeyS')).toEqual(IDLE);
    expect(anim.visual('KeyD')).toEqual(IDLE);
    expect(anim.visual('KeyF')).toEqual(IDLE);
  });

  it('重置计时哨兵：reset 后首帧仍不推进', () => {
    const anim = new KeyboardAnimator();
    const tick = makeClock(anim);
    advance(tick, 500);
    anim.reset();
    anim.press('KeyA');
    anim.update(10000);
    expect(anim.visual('KeyA').press).toBe(0);
  });
});
