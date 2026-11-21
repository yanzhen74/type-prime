/**
 * 键盘动画（表现层打磨任务 5 的第四步，详见 PLAN.md §10.4.4）。
 *
 * 训练面板键盘参考区的纯动画状态机：把「按键下压回弹 / 错键抖动 / 下一键呼吸 /
 * 层级渐入 / 击键涟漪」抽成与绘制无关的数值通道，由调用方按帧注入时间推进。
 *
 * 计时口径遵循帧内计时不变量：内部绝不取 performance.now()，只按 update(now)
 * 注入的时间戳派生 dt（首帧哨兵 -1、单帧步长上限 MAX_KEY_ANIM_STEP），
 * 因此 tick(0)/tick(16) 这类合成时间单测可精确断言每个通道的位置。
 *
 * 本模块不持有 rAF 与 DOM：渲染器（train-panel.ts 的 MiniKeyboardCanvas）负责
 * 取数值绘制并决定何时继续请求下一帧，动画停下时循环自然停止，不空转。
 */

/** 数值钳制到 [0,1] */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 缓动：快出慢停，用于下压与渐入 */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/** 缓动：末端轻微过冲，用于键帽松开时的回弹（会短暂越过静止位再落回） */
export function easeOutBack(t: number): number {
  const x = clamp01(t);
  // 端点显式返回，避免浮点误差让完全落定的状态仍带微小位移
  if (x === 0) return 0;
  if (x === 1) return 1;
  const s = 1.70158;
  return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
}

/** 动画参数表（纯数据，便于调参与单测；单位：毫秒 / 像素 / 0–1 比例） */
export interface KeyAnimSpec {
  /** 正确击键：下压段 + 回弹段，travel 为下沉像素，squash 为键帽收缩比例 */
  press: { downMs: number; upMs: number; travel: number; squash: number };
  /** 错误击键：总时长、红色攻击段、水平抖动幅度与抖动周期数 */
  error: { ms: number; attackMs: number; shakeAmp: number; shakeCycles: number };
  /** 下一键引导：呼吸周期、上浮像素、发光半径与底色浓度的上下限 */
  hint: {
    periodMs: number;
    lift: number;
    glowMin: number;
    glowMax: number;
    fillMin: number;
    fillMax: number;
  };
  /** 层级高亮：渐入/渐出时长与逐键错峰间隔 */
  layer: { inMs: number; outMs: number; staggerMs: number };
  /** 击键涟漪：寿命、外扩比例、起始不透明度 */
  ripple: { ms: number; spread: number; alpha: number };
  /** 降级模式（系统偏好减少动态效果 / 用户关闭动画）：只保留纯色块停留，无位移 */
  reduced: { pressHoldMs: number; errorHoldMs: number; hintFill: number };
}

export const KEY_ANIM: KeyAnimSpec = {
  press: { downMs: 55, upMs: 200, travel: 3.5, squash: 0.06 },
  error: { ms: 340, attackMs: 40, shakeAmp: 3.6, shakeCycles: 3 },
  hint: { periodMs: 1500, lift: 1.4, glowMin: 5, glowMax: 14, fillMin: 0.26, fillMax: 0.44 },
  layer: { inMs: 260, outMs: 180, staggerMs: 22 },
  ripple: { ms: 420, spread: 0.55, alpha: 0.5 },
  reduced: { pressHoldMs: 80, errorHoldMs: 320, hintFill: 0.6 },
};

/** 单帧步长上限：吸收切标签页 / rAF 停顿后的巨大 dt，避免键帽瞬移 */
export const MAX_KEY_ANIM_STEP = 50;
/** 同时存在的涟漪上限：快速连击时丢弃最老的，避免无限增长 */
export const MAX_KEY_RIPPLES = 12;
/** 一次正确击键的完整动画时长（下压 + 回弹） */
export const PRESS_TOTAL_MS = KEY_ANIM.press.downMs + KEY_ANIM.press.upMs;

/** 单个键帽的瞬时视觉通道，全部为绘制用数值，不含任何判定语义 */
export interface KeyVisual {
  /** 垂直位移 px：正=下沉，负=呼吸上浮或回弹过冲 */
  dy: number;
  /** 键帽缩放：1=静止，小于 1=被按下 */
  scale: number;
  /** 水平抖动位移 px（错键） */
  shake: number;
  /** 按下强度 0–1：渲染器据此叠加强调色 */
  press: number;
  /** 错误强度 0–1：渲染器据此叠加危险色 */
  error: number;
  /** 呼吸相位 0–1：渲染器据此插值引导底色与发光 */
  hint: number;
  /** 层级高亮不透明度 0–1（渐入渐出） */
  layer: number;
  /** 外发光半径 px */
  glow: number;
}

/** 击键涟漪：以键帽几何为中心外扩的一圈描边 */
export interface KeyRipple {
  code: string;
  age: number;
  ttl: number;
  kind: 'press' | 'error';
}

/** 层级高亮的逐键补间状态 */
interface LayerTween {
  from: number;
  to: number;
  value: number;
  age: number;
  delay: number;
  dur: number;
}

export interface KeyboardAnimatorOptions {
  /** 降级模式：无位移/无抖动/无涟漪/无呼吸，只保留色块停留（默认 false） */
  reducedMotion?: boolean;
}

/** 下压包络：返回下沉量、缩放与强调色强度（纯函数，便于单测） */
export function pressEnvelope(age: number): { dy: number; scale: number; intensity: number } {
  const { downMs, upMs, travel, squash } = KEY_ANIM.press;
  if (age <= downMs) {
    const e = easeOutCubic(age / downMs);
    return { dy: travel * e, scale: 1 - squash * e, intensity: e };
  }
  const t = clamp01((age - downMs) / upMs);
  const e = easeOutBack(t);
  return {
    dy: travel * (1 - e),
    scale: 1 - squash * (1 - e),
    intensity: 1 - easeOutCubic(t),
  };
}

/** 错键包络：红色快攻击慢衰减 + 衰减正弦抖动（纯函数，便于单测） */
export function errorEnvelope(age: number): { shake: number; intensity: number } {
  const { ms, attackMs, shakeAmp, shakeCycles } = KEY_ANIM.error;
  const t = clamp01(age / ms);
  const attack = clamp01(age / attackMs);
  return {
    shake: shakeAmp * Math.sin(Math.PI * 2 * shakeCycles * t) * (1 - t),
    intensity: attack * Math.pow(1 - t, 0.7),
  };
}

/**
 * 键盘动画状态机。
 *
 * 状态优先级与既有静态渲染一致：错键 > 按下 > 下一键引导 > 层级高亮。
 * 所有通道只按注入 dt 推进，事件（press/setHint/setLayer）把对应通道的年龄归零。
 */
export class KeyboardAnimator {
  private hintCode: string | null = null;
  private hintAge = 0;
  private layerTargets = new Set<string>();
  private readonly layers = new Map<string, LayerTween>();
  private readonly presses = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly ripples: KeyRipple[] = [];
  private lastNow = -1;
  private reduced: boolean;

  constructor(options: KeyboardAnimatorOptions = {}) {
    this.reduced = options.reducedMotion ?? false;
  }

  /** 当前是否降级为「无位移」模式 */
  get reducedMotion(): boolean {
    return this.reduced;
  }

  /** 当前下一键引导的键位（无引导时为 null） */
  get hint(): string | null {
    return this.hintCode;
  }

  /** 只读涟漪列表：供渲染器绘制与测试观察 */
  get rippleList(): readonly KeyRipple[] {
    return this.ripples;
  }

  /**
   * 是否仍有动画在推进：渲染器据此决定是否继续请求下一帧。
   * 呼吸是持续动画，因此只要存在下一键引导就保持活跃；引导清空且瞬时通道
   * 全部落定后返回 false，循环自然停止（空闲时不空转）。
   */
  get active(): boolean {
    if (this.presses.size > 0 || this.errors.size > 0 || this.ripples.length > 0) {
      return true;
    }
    if (this.reduced) {
      return false;
    }
    if (this.hintCode !== null) {
      return true;
    }
    for (const tween of this.layers.values()) {
      if (tween.age < tween.delay + tween.dur) {
        return true;
      }
    }
    return false;
  }

  /** 设置下一键引导；同值早退，避免每次进度回调都重置呼吸相位 */
  setHint(code: string | null): void {
    if (code === this.hintCode) {
      return;
    }
    this.hintCode = code;
    this.hintAge = 0;
  }

  /**
   * 设置当前层级涉及的键位：新纳入的键按传入顺序错峰渐入，移出的键渐出。
   * 与上一次完全相同的键组不重启动画（层级未变时会被重复调用）。
   */
  setLayer(codes: string[]): void {
    const next = new Set(codes);
    if (next.size === this.layerTargets.size && [...next].every((c) => this.layerTargets.has(c))) {
      return;
    }
    this.layerTargets = next;

    const order = new Map<string, number>();
    codes.forEach((code, index) => order.set(code, index));
    const union = new Set<string>([...this.layers.keys(), ...next]);

    for (const code of union) {
      const to = next.has(code) ? 1 : 0;
      const prev = this.layers.get(code);
      const from = prev ? prev.value : 0;
      // 已定格的渐入键无需重新补间
      if (prev && to === 1 && prev.to === 1 && prev.age >= prev.delay + prev.dur) {
        continue;
      }
      if (!prev && to === 0) {
        continue;
      }
      const dur = this.reduced ? 0 : to === 1 ? KEY_ANIM.layer.inMs : KEY_ANIM.layer.outMs;
      this.layers.set(code, {
        from,
        to,
        value: dur === 0 ? to : from,
        age: 0,
        delay: dur === 0 || to === 0 ? 0 : (order.get(code) ?? 0) * KEY_ANIM.layer.staggerMs,
        dur,
      });
    }
  }

  /** 正确击键：下压回弹 + 强调色涟漪；与错键通道互斥 */
  press(code: string): void {
    this.presses.set(code, 0);
    this.errors.delete(code);
    this.addRipple(code, 'press');
  }

  /** 错误击键：抖动 + 危险色涟漪；优先于按下与引导 */
  pressError(code: string): void {
    this.errors.set(code, 0);
    this.presses.delete(code);
    this.addRipple(code, 'error');
  }

  /** 切换降级模式：立即把在飞的补间定格，清掉涟漪，避免残留位移 */
  setReducedMotion(flag: boolean): void {
    if (flag === this.reduced) {
      return;
    }
    this.reduced = flag;
    this.ripples.length = 0;
    this.hintAge = 0;
    for (const tween of this.layers.values()) {
      tween.value = tween.to;
      tween.age = tween.delay + tween.dur;
      tween.dur = 0;
      tween.delay = 0;
    }
    for (const [code, tween] of this.layers) {
      if (tween.to === 0) {
        this.layers.delete(code);
      }
    }
  }

  /** 按注入时间戳推进全部通道（首帧 dt=0，单帧步长上限 MAX_KEY_ANIM_STEP） */
  update(now: number): void {
    const dt = this.lastNow < 0 ? 0 : Math.min(Math.max(0, now - this.lastNow), MAX_KEY_ANIM_STEP);
    this.lastNow = now;
    if (dt === 0) {
      return;
    }

    if (this.hintCode !== null) {
      this.hintAge += dt;
    }

    const pressTotal = this.reduced ? KEY_ANIM.reduced.pressHoldMs : PRESS_TOTAL_MS;
    for (const [code, age] of this.presses) {
      const next = age + dt;
      if (next >= pressTotal) {
        this.presses.delete(code);
      } else {
        this.presses.set(code, next);
      }
    }

    const errorTotal = this.reduced ? KEY_ANIM.reduced.errorHoldMs : KEY_ANIM.error.ms;
    for (const [code, age] of this.errors) {
      const next = age + dt;
      if (next >= errorTotal) {
        this.errors.delete(code);
      } else {
        this.errors.set(code, next);
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];
      ripple.age += dt;
      if (ripple.age >= ripple.ttl) {
        this.ripples.splice(i, 1);
      }
    }

    for (const [code, tween] of this.layers) {
      tween.age += dt;
      if (tween.age >= tween.delay + tween.dur) {
        if (tween.to === 0) {
          this.layers.delete(code);
        } else {
          tween.value = tween.to;
          tween.age = tween.delay + tween.dur;
        }
      } else {
        tween.value =
          tween.from +
          (tween.to - tween.from) * easeOutCubic((tween.age - tween.delay) / tween.dur);
      }
    }
  }

  /** 取某键当前的视觉通道（每次返回新对象，调用方可安全持有） */
  visual(code: string): KeyVisual {
    const visual: KeyVisual = {
      dy: 0,
      scale: 1,
      shake: 0,
      press: 0,
      error: 0,
      hint: 0,
      layer: 0,
      glow: 0,
    };

    const tween = this.layers.get(code);
    if (tween) {
      visual.layer = tween.value;
    }

    if (this.reduced) {
      // 降级：只有纯色块停留，位移/缩放/抖动/发光全部归零
      if (this.errors.has(code)) {
        visual.error = 1;
      } else if (this.presses.has(code)) {
        visual.press = 1;
      }
      if (this.hintCode === code) {
        visual.hint = KEY_ANIM.reduced.hintFill;
      }
      return visual;
    }

    const errorAge = this.errors.get(code);
    if (errorAge !== undefined) {
      const env = errorEnvelope(errorAge);
      visual.error = env.intensity;
      visual.shake = env.shake;
      visual.glow = 12 * env.intensity;
      visual.dy = KEY_ANIM.press.travel * 0.6 * clamp01(errorAge / KEY_ANIM.error.attackMs);
      return visual;
    }

    const pressAge = this.presses.get(code);
    if (pressAge !== undefined) {
      const env = pressEnvelope(pressAge);
      visual.dy = env.dy;
      visual.scale = env.scale;
      visual.press = env.intensity;
      visual.glow = 10 * env.intensity;
      return visual;
    }

    if (this.hintCode === code) {
      const breath = 0.5 - 0.5 * Math.cos((Math.PI * 2 * this.hintAge) / KEY_ANIM.hint.periodMs);
      visual.hint = breath;
      visual.dy = -KEY_ANIM.hint.lift * breath;
      visual.glow =
        KEY_ANIM.hint.glowMin + (KEY_ANIM.hint.glowMax - KEY_ANIM.hint.glowMin) * breath;
    }
    return visual;
  }

  /** 清空全部通道（重置练习 / 切换模式时调用） */
  reset(): void {
    this.hintCode = null;
    this.hintAge = 0;
    this.layerTargets = new Set();
    this.layers.clear();
    this.presses.clear();
    this.errors.clear();
    this.ripples.length = 0;
    this.lastNow = -1;
  }

  private addRipple(code: string, kind: 'press' | 'error'): void {
    if (this.reduced) {
      return;
    }
    if (this.ripples.length >= MAX_KEY_RIPPLES) {
      this.ripples.shift();
    }
    this.ripples.push({ code, age: 0, ttl: KEY_ANIM.ripple.ms, kind });
  }
}
