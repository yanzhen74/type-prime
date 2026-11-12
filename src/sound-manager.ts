/**
 * 音效系统（块三表现层打磨任务 5 的第一步，详见 PLAN.md §10.4）。
 *
 * 设计口径与项目其余部分一致：不引入音频文件与第三方依赖，全部音效由 WebAudio
 * 实时合成（单个振荡器 + 增益包络），音色/音高/时长抽为纯数据表 `SFX_SPECS` 便于测试与调音。
 *
 * 浏览器自动播放策略要求音频上下文在用户手势中创建，因此 AudioContext 懒创建：
 * 首次 `play()`（本身就发生在按键手势里）才实例化，处于 suspended 时自动 resume。
 * 环境不支持 WebAudio（如 jsdom 单测）时 `play()` 退化为 no-op，不抛异常。
 */

/**
 * 三个游戏模式共用的音效名，各模式只使用其中子集。
 * `shoot`/`hit`/`kill`/`miss`/`miss-hit`/`splat` 沿用僵尸大战既有 `ZombieSfx` 命名，
 * 便于把游戏钩子直接接到本模块。
 */
export type GameSfx =
  | 'key'
  | 'error'
  | 'destroy'
  | 'levelup'
  | 'hurt'
  | 'heal'
  | 'boss'
  | 'start'
  | 'gameover'
  | 'shoot'
  | 'hit'
  | 'kill'
  | 'miss'
  | 'miss-hit'
  | 'splat';

/** 单个音效的合成参数 */
export interface SfxSpec {
  /** 振荡器波形 */
  wave: OscillatorType;
  /** 起始频率 Hz */
  freq: number;
  /** 结束频率 Hz；缺省表示不滑音 */
  freqEnd?: number;
  /** 时长 ms */
  duration: number;
  /** 峰值增益（0–1，未乘总音量） */
  gain: number;
}

/**
 * 音色表：短促高频表示正确输入，低频下滑表示失败/受伤，
 * 逐字符触发的 `key`/`shoot`/`hit` 音量刻意压低，避免连打时叠成噪音墙。
 */
export const SFX_SPECS: Record<GameSfx, SfxSpec> = {
  key: { wave: 'triangle', freq: 880, freqEnd: 1174, duration: 45, gain: 0.05 },
  error: { wave: 'sawtooth', freq: 220, freqEnd: 140, duration: 140, gain: 0.08 },
  destroy: { wave: 'square', freq: 520, freqEnd: 120, duration: 180, gain: 0.09 },
  levelup: { wave: 'triangle', freq: 523, freqEnd: 1046, duration: 260, gain: 0.09 },
  hurt: { wave: 'sawtooth', freq: 180, freqEnd: 80, duration: 220, gain: 0.11 },
  heal: { wave: 'sine', freq: 660, freqEnd: 990, duration: 200, gain: 0.07 },
  boss: { wave: 'square', freq: 140, freqEnd: 90, duration: 420, gain: 0.11 },
  start: { wave: 'triangle', freq: 392, freqEnd: 784, duration: 200, gain: 0.08 },
  gameover: { wave: 'sine', freq: 440, freqEnd: 110, duration: 700, gain: 0.11 },
  shoot: { wave: 'square', freq: 700, freqEnd: 420, duration: 55, gain: 0.04 },
  hit: { wave: 'triangle', freq: 900, freqEnd: 600, duration: 50, gain: 0.045 },
  kill: { wave: 'square', freq: 300, freqEnd: 60, duration: 260, gain: 0.1 },
  miss: { wave: 'sawtooth', freq: 300, freqEnd: 180, duration: 90, gain: 0.045 },
  'miss-hit': { wave: 'sawtooth', freq: 200, freqEnd: 120, duration: 120, gain: 0.06 },
  splat: { wave: 'sine', freq: 160, freqEnd: 70, duration: 120, gain: 0.045 },
};

/** 同名音效最小间隔，避免快速连打时同一音色堆叠削波 */
const SFX_THROTTLE_MS = 30;
/** 增益包络起音，避免爆音 */
const SFX_ATTACK = 0.005;
const DEFAULT_VOLUME = 0.6;

/** 最小 AudioContext 结构（便于单测注入替身，只用到本模块需要的成员） */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface AudioParamLike {
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

export interface OscillatorLike {
  type: string;
  readonly frequency: AudioParamLike;
  connect(destination: unknown): void;
  start(time: number): void;
  stop(time: number): void;
  disconnect(): void;
}

export interface GainLike {
  readonly gain: AudioParamLike;
  connect(destination: unknown): void;
  disconnect(): void;
}

/** 音频上下文工厂：返回 null 表示当前环境不支持 WebAudio */
export type AudioContextFactory = () => AudioContextLike | null;

export interface SoundManagerOptions {
  /** 初始是否启用，默认 true */
  enabled?: boolean;
  /** 总音量 0–1，默认 0.6 */
  volume?: number;
  /** 注入音频上下文工厂（默认使用浏览器 AudioContext，测试可替换） */
  contextFactory?: AudioContextFactory;
}

/** 浏览器默认工厂：不支持或构造失败时返回 null，由调用方降级为静音 */
function createBrowserAudioContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const holder = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Ctor = holder.AudioContext ?? holder.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

/**
 * 音效播放器：把游戏事件名映射为合成音色并即时播放。
 *
 * 无状态副作用（不改游戏逻辑），游戏侧只保留 `onSfx?: (name) => void` 钩子，
 * 因此音效可整体关闭而不影响任何判定与测试。
 */
export class SoundManager {
  private ctx: AudioContextLike | null = null;
  private enabled: boolean;
  private volume: number;
  private readonly contextFactory: AudioContextFactory;
  private readonly lastPlayedAt = new Map<GameSfx, number>();

  constructor(options: SoundManagerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.volume = clampVolume(options.volume ?? DEFAULT_VOLUME);
    this.contextFactory = options.contextFactory ?? createBrowserAudioContext;
  }

  /** 播放一个音效；关闭、不支持 WebAudio 或节流窗口内重复触发时为 no-op */
  play(name: GameSfx): void {
    if (!this.enabled) return;
    const spec = SFX_SPECS[name];
    if (!spec) return;

    const now = Date.now();
    const last = this.lastPlayedAt.get(name);
    if (last !== undefined && now - last < SFX_THROTTLE_MS) return;
    this.lastPlayedAt.set(name, now);

    const ctx = this.ensureContext();
    if (!ctx) return;

    const startAt = ctx.currentTime;
    const endAt = startAt + spec.duration / 1000;
    const peak = spec.gain * this.volume;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), startAt + SFX_ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(spec.freq, startAt);
    if (spec.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), endAt);
    }
    osc.connect(gain);
    osc.start(startAt);
    // 播放结束后自行断开，避免节点堆积
    osc.stop(endAt);
  }

  /** 在用户手势中提前解锁音频上下文（可选；play 也会懒创建） */
  unlock(): void {
    if (!this.enabled) return;
    this.ensureContext();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.lastPlayedAt.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
  }

  getVolume(): number {
    return this.volume;
  }

  /** 懒创建音频上下文；被浏览器挂起时尝试恢复 */
  private ensureContext(): AudioContextLike | null {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
    }
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }
}

/** 音量夹到 0–1，非法值回退默认 */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, volume));
}
