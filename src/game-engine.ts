import type { TypingEngine } from './input.js';
import type { GameBaseState } from './types.js';

/** 游戏状态变更与结束回调 */
export interface GameCallbacks<S> {
  onUpdate: (state: S) => void;
  onGameOver: (score: number) => void;
}

/** 通用游戏选项（难度相关，子类可扩展） */
export interface GameEngineOptions {
  /** 起始等级（>=1） */
  startingLevel?: number;
  /** 速度倍率，乘在基础速度上 */
  speedMultiplier?: number;
}

/**
 * 指法游戏通用基类（块三游戏任务 1）。
 *
 * 封装所有指法游戏共有的能力，供 FallingWordGame / 闯关射击 / 僵尸大战复用：
 * - 画布与 2D 上下文获取；
 * - 游戏循环（requestAnimationFrame）与倒计时；
 * - 状态管理（score/lives/level/isRunning/isPaused/countdown/mistakes/lastError）；
 * - 暂停 / 恢复 / 重置 / 结束判定；
 * - TypingEngine 统一输入接入（char/backspace/submit/escape 路由 + 运行态门控）。
 *
 * 子类只需实现 createState / update / draw / onChar 等钩子，专注各自玩法。
 */
export abstract class GameEngine<S extends GameBaseState = GameBaseState> {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected state: S;
  protected animationId = 0;
  protected countdownTimer = 0;
  protected startingLevel: number;
  protected speedMultiplier: number;

  private readonly onUpdate: (state: S) => void;
  private readonly onGameOver: (score: number) => void;
  private inputUnsubscribe: (() => void) | null = null;

  constructor(canvasId: string, callbacks: GameCallbacks<S>, options: GameEngineOptions = {}) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Game canvas not found');
    }
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = ctx;
    this.onUpdate = callbacks.onUpdate;
    this.onGameOver = callbacks.onGameOver;
    this.startingLevel = Math.max(1, options.startingLevel ?? 1);
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.state = this.createState();
  }

  /** 构造完整初始状态（应基于 createBaseState() 扩展各自字段） */
  protected abstract createState(): S;
  /** 每帧逻辑更新（不含绘制） */
  protected abstract update(now: number): void;
  /** 每帧绘制 */
  protected abstract draw(): void;
  /** 处理一个字符输入（子类实现匹配、计分与错误记录） */
  protected abstract onChar(char: string): void;

  /** 退格输入钩子，默认无操作 */
  protected onBackspace(): void {}
  /** 提交输入钩子，默认无操作 */
  protected onSubmit(): void {}
  /** 开始（含倒计时启动）生命周期钩子 */
  protected onStart(): void {}
  /** 倒计时结束 / 恢复运行生命周期钩子（子类可重置出怪计时器等） */
  protected onResume(): void {}

  /** 基础状态工厂：子类 createState 时展开后补充各自字段 */
  protected createBaseState(): GameBaseState {
    return {
      score: 0,
      lives: 0,
      level: this.startingLevel,
      isRunning: false,
      isPaused: false,
      countdown: 3,
      mistakes: 0,
    };
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state = this.createState();
    this.state.isRunning = true;
    this.state.countdown = 3;
    this.onStart();
    this.runCountdown();
    this.emitUpdate();
  }

  /** 游戏是否正在运行（含倒计时和暂停状态） */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  pause(): void {
    this.state.isPaused = !this.state.isPaused;
    if (!this.state.isPaused) {
      this.onResume();
      this.loop(performance.now());
    } else {
      this.stopLoop();
      this.draw();
    }
    this.emitUpdate();
  }

  reset(): void {
    this.state.isRunning = false;
    this.stopLoop();
    window.clearTimeout(this.countdownTimer);
    this.state = this.createState();
    this.draw();
    this.emitUpdate();
  }

  /** 接入统一输入引擎：将 char/backspace/submit/escape 事件路由到对应处理方法 */
  attachInput(engine: TypingEngine): void {
    this.detachInput();
    this.inputUnsubscribe = engine.on((event) => {
      switch (event.type) {
        case 'char':
          this.handleChar(event.char);
          break;
        case 'backspace':
          this.handleBackspace();
          break;
        case 'submit':
          this.submitWord();
          break;
        case 'escape':
          this.handleEscape();
          break;
      }
    });
  }

  /** 解除输入引擎订阅 */
  detachInput(): void {
    this.inputUnsubscribe?.();
    this.inputUnsubscribe = null;
  }

  /** 喂入一个字符（外部监听或 TypingEngine）；统一做运行态门控后交给 onChar */
  handleChar(char: string): void {
    if (!this.acceptsInput()) return;
    this.onChar(char);
  }

  /** 退格；门控后交给 onBackspace */
  handleBackspace(): void {
    if (!this.acceptsInput()) return;
    this.onBackspace();
  }

  /** 提交；门控后交给 onSubmit */
  submitWord(): void {
    if (!this.acceptsInput()) return;
    this.onSubmit();
  }

  /** Esc 默认重置游戏 */
  handleEscape(): void {
    this.reset();
  }

  /** 运行态门控：仅运行中、未暂停、倒计时结束后才接受输入 */
  protected acceptsInput(): boolean {
    return this.state.isRunning && !this.state.isPaused && this.state.countdown === 0;
  }

  /** 记录一次错误输入：累加失误并写入 lastError，供 draw 做短时闪烁反馈 */
  protected recordError(char: string): void {
    this.state.mistakes += 1;
    this.state.lastError = { char, at: performance.now() };
  }

  /** 通知外部状态变更 */
  protected emitUpdate(): void {
    this.onUpdate(this.state);
  }

  /** 结束游戏：停止循环并回调 onGameOver */
  protected gameOver(): void {
    this.state.isRunning = false;
    this.stopLoop();
    this.onGameOver(this.state.score);
    this.emitUpdate();
  }

  /** 停止 rAF 循环 */
  protected stopLoop(): void {
    cancelAnimationFrame(this.animationId);
  }

  private runCountdown(): void {
    if (this.state.countdown > 0) {
      this.draw();
      this.countdownTimer = window.setTimeout(() => {
        this.state.countdown -= 1;
        this.emitUpdate();
        this.runCountdown();
      }, 1000);
    } else {
      this.onResume();
      this.loop(performance.now());
    }
  }

  private loop(now: number): void {
    if (!this.state.isRunning || this.state.isPaused || this.state.countdown > 0) return;
    this.update(now);
    this.draw();
    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }
}
