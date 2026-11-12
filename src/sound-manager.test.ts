import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  SFX_SPECS,
  SoundManager,
  clampVolume,
  type AudioContextLike,
  type GameSfx,
  type GainLike,
  type OscillatorLike,
} from './sound-manager.js';

/** 记录调用轨迹的假节点，用于断言合成参数而不依赖真实 WebAudio */
interface ParamCall {
  method: 'set' | 'linear' | 'exp';
  value: number;
  time: number;
}

interface FakeParam {
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

function createParam(): { param: FakeParam; calls: ParamCall[] } {
  const calls: ParamCall[] = [];
  const param: FakeParam = {
    setValueAtTime: (value, time) => calls.push({ method: 'set', value, time }),
    linearRampToValueAtTime: (value, time) => calls.push({ method: 'linear', value, time }),
    exponentialRampToValueAtTime: (value, time) => calls.push({ method: 'exp', value, time }),
  };
  return { param, calls };
}

interface FakeOsc extends OscillatorLike {
  type: string;
  freqCalls: ParamCall[];
  started: number[];
  stopped: number[];
  connected: unknown[];
  disconnects: number;
}

interface FakeGain extends GainLike {
  gainCalls: ParamCall[];
  connected: unknown[];
}

interface FakeContext extends AudioContextLike {
  state: string;
  resumeCalls: number;
  oscs: FakeOsc[];
  gains: FakeGain[];
}

function createFakeContext(state = 'running'): FakeContext {
  const destination = { name: 'destination' };
  const ctx: FakeContext = {
    currentTime: 1.5,
    state,
    destination,
    resumeCalls: 0,
    oscs: [],
    gains: [],
    resume() {
      ctx.resumeCalls += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
    createOscillator() {
      const { param, calls } = createParam();
      const osc: FakeOsc = {
        type: 'sine',
        frequency: param,
        freqCalls: calls,
        started: [],
        stopped: [],
        connected: [],
        disconnects: 0,
        connect(target: unknown) {
          osc.connected.push(target);
        },
        start(time: number) {
          osc.started.push(time);
        },
        stop(time: number) {
          osc.stopped.push(time);
        },
        disconnect() {
          osc.disconnects += 1;
        },
      };
      ctx.oscs.push(osc);
      return osc;
    },
    createGain() {
      const { param, calls } = createParam();
      const gain: FakeGain = {
        gain: param,
        gainCalls: calls,
        connected: [],
        connect(target: unknown) {
          gain.connected.push(target);
        },
        disconnect() {
          // 测试中不需要断开计数
        },
      };
      ctx.gains.push(gain);
      return gain;
    },
  };
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SFX_SPECS 音色表', () => {
  const names: GameSfx[] = [
    'key',
    'error',
    'destroy',
    'levelup',
    'hurt',
    'heal',
    'boss',
    'start',
    'gameover',
    'shoot',
    'hit',
    'kill',
    'miss',
    'miss-hit',
    'splat',
  ];

  it('覆盖全部音效名且参数合法', () => {
    expect(Object.keys(SFX_SPECS).sort()).toEqual([...names].sort());
    for (const name of names) {
      const spec = SFX_SPECS[name];
      expect(spec.duration).toBeGreaterThan(0);
      expect(spec.gain).toBeGreaterThan(0);
      expect(spec.gain).toBeLessThanOrEqual(1);
      expect(spec.freq).toBeGreaterThan(0);
      if (spec.freqEnd !== undefined) {
        expect(spec.freqEnd).toBeGreaterThan(0);
      }
      expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(spec.wave);
    }
  });

  it('包含僵尸大战既有的全部音效名（ZombieSfx 可直接接入）', () => {
    for (const name of ['shoot', 'hit', 'kill', 'miss', 'miss-hit', 'splat'] as const) {
      expect(SFX_SPECS[name]).toBeDefined();
    }
  });

  it('逐字符音效音量低于事件音效，避免连打削波', () => {
    expect(SFX_SPECS.key.gain).toBeLessThan(SFX_SPECS.destroy.gain);
    expect(SFX_SPECS.shoot.gain).toBeLessThan(SFX_SPECS.kill.gain);
  });
});

describe('clampVolume', () => {
  it('夹到 0–1，非法值回退默认 0.6', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(0.3)).toBe(0.3);
    expect(clampVolume(Number.NaN)).toBe(0.6);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(0.6);
  });
});

describe('SoundManager', () => {
  it('play 合成一次振荡器 + 增益包络，参数取自音色表并乘总音量', () => {
    const ctx = createFakeContext();
    const sound = new SoundManager({ contextFactory: () => ctx, volume: 0.5 });

    sound.play('destroy');

    expect(ctx.oscs).toHaveLength(1);
    expect(ctx.gains).toHaveLength(1);
    const spec = SFX_SPECS.destroy;
    const osc = ctx.oscs[0];
    expect(osc.type).toBe(spec.wave);
    expect(osc.freqCalls[0]).toEqual({ method: 'set', value: spec.freq, time: ctx.currentTime });
    expect(osc.freqCalls[1]).toEqual({
      method: 'exp',
      value: spec.freqEnd,
      time: ctx.currentTime + spec.duration / 1000,
    });
    expect(osc.started).toEqual([ctx.currentTime]);
    expect(osc.stopped).toEqual([ctx.currentTime + spec.duration / 1000]);
    // 振荡器接到增益节点，增益节点接到输出
    expect(osc.connected).toEqual([ctx.gains[0]]);
    expect(ctx.gains[0].connected).toEqual([ctx.destination]);
    // 峰值增益 = 音色表 gain × 总音量
    const peak = ctx.gains[0].gainCalls.find((c) => c.method === 'linear');
    expect(peak?.value).toBeCloseTo(spec.gain * 0.5, 6);
  });

  it('无滑音的音色只设置起始频率', () => {
    const ctx = createFakeContext();
    const sound = new SoundManager({ contextFactory: () => ctx });
    const name = (Object.keys(SFX_SPECS) as GameSfx[]).find(
      (n) => SFX_SPECS[n].freqEnd === undefined
    );
    // 当前音色表全部带滑音；若后续新增无滑音音色，此用例保证其不产生多余 ramp
    if (name) {
      sound.play(name);
      expect(ctx.oscs[0].freqCalls).toHaveLength(1);
    } else {
      expect(name).toBeUndefined();
    }
  });

  it('关闭时不创建音频上下文也不发声', () => {
    const factory = vi.fn(() => createFakeContext() as AudioContextLike);
    const sound = new SoundManager({ enabled: false, contextFactory: factory });

    sound.play('key');
    sound.unlock();

    expect(factory).not.toHaveBeenCalled();
  });

  it('同名音效在节流窗口内只播一次，超过窗口可再播；不同名互不节流', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const ctx = createFakeContext();
    const sound = new SoundManager({ contextFactory: () => ctx });

    sound.play('key');
    sound.play('key');
    expect(ctx.oscs).toHaveLength(1);

    sound.play('error');
    expect(ctx.oscs).toHaveLength(2);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.050Z'));
    sound.play('key');
    expect(ctx.oscs).toHaveLength(3);
  });

  it('环境不支持 WebAudio 时 play 为 no-op 且不抛异常', () => {
    const sound = new SoundManager({ contextFactory: () => null });
    expect(() => sound.play('kill')).not.toThrow();
    expect(() => sound.unlock()).not.toThrow();
  });

  it('上下文被挂起时播放前自动 resume', () => {
    const ctx = createFakeContext('suspended');
    const sound = new SoundManager({ contextFactory: () => ctx });

    sound.play('hit');

    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.oscs).toHaveLength(1);
  });

  it('setEnabled 与 setVolume 即时生效', () => {
    const ctx = createFakeContext();
    const sound = new SoundManager({ contextFactory: () => ctx });

    sound.setEnabled(false);
    expect(sound.isEnabled()).toBe(false);
    sound.play('key');
    expect(ctx.oscs).toHaveLength(0);

    sound.setEnabled(true);
    sound.setVolume(1);
    expect(sound.getVolume()).toBe(1);
    sound.play('key');
    expect(ctx.oscs).toHaveLength(1);
    const peak = ctx.gains[0].gainCalls.find((c) => c.method === 'linear');
    expect(peak?.value).toBeCloseTo(SFX_SPECS.key.gain, 6);
  });

  it('未知音效名安全忽略', () => {
    const ctx = createFakeContext();
    const sound = new SoundManager({ contextFactory: () => ctx });
    expect(() => sound.play('unknown' as GameSfx)).not.toThrow();
    expect(ctx.oscs).toHaveLength(0);
  });
});
