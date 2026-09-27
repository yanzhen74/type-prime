import type { Word, GameState } from './types.js';

const VOCABULARY = [
  'apple', 'banana', 'grape', 'lemon', 'peach',
  'tiger', 'rabbit', 'eagle', 'dolphin', 'penguin',
  'happy', 'bright', 'strong', 'gentle', 'clever',
  'planet', 'rocket', 'galaxy', 'comet', 'nebula',
  'function', 'variable', 'array', 'object', 'return',
];

export class FallingWordGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private animationId = 0;
  private lastSpawn = 0;
  private onUpdate: (state: GameState) => void;
  private onGameOver: (score: number) => void;

  constructor(
    canvasId: string,
    onUpdate: (state: GameState) => void,
    onGameOver: (score: number) => void
  ) {
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
    this.onUpdate = onUpdate;
    this.onGameOver = onGameOver;
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      score: 0,
      lives: 3,
      level: 1,
      isRunning: false,
      isPaused: false,
      words: [],
      currentInput: '',
      lockedWordIndex: null,
    };
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state = this.createInitialState();
    this.state.isRunning = true;
    this.lastSpawn = performance.now();
    this.loop(performance.now());
    this.onUpdate(this.state);
  }

  pause(): void {
    this.state.isPaused = !this.state.isPaused;
    if (!this.state.isPaused) {
      this.lastSpawn = performance.now();
      this.loop(performance.now());
    }
    this.onUpdate(this.state);
  }

  reset(): void {
    this.state.isRunning = false;
    cancelAnimationFrame(this.animationId);
    this.state = this.createInitialState();
    this.draw();
    this.onUpdate(this.state);
  }

  handleInput(char: string): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    // 自动锁定：优先匹配当前输入开头的单词；若无则匹配最近的未锁定单词
    if (this.state.lockedWordIndex === null) {
      const matchIndex = this.findMatchingWord(char);
      if (matchIndex !== null) {
        this.state.lockedWordIndex = matchIndex;
      } else {
        return;
      }
    }

    const word = this.state.words[this.state.lockedWordIndex];
    if (!word) return;

    const expected = word.text[word.typedIndex].toLowerCase();
    if (char === expected) {
      word.typedIndex += 1;
      this.state.currentInput += char;

      if (word.typedIndex >= word.text.length) {
        this.destroyWord(this.state.lockedWordIndex);
      }
    }
  }

  submitWord(): void {
    if (!this.state.isRunning || this.state.isPaused) return;
    // 当前设计为逐字符输入即销毁，submit 用于清理输入框显示
    this.state.currentInput = '';
    this.onUpdate(this.state);
  }

  private findMatchingWord(char: string): number | null {
    // 优先找以该字符开头的单词
    for (let i = 0; i < this.state.words.length; i++) {
      const word = this.state.words[i];
      if (word.text[0].toLowerCase() === char) {
        return i;
      }
    }
    return null;
  }

  private destroyWord(index: number): void {
    const word = this.state.words[index];
    if (!word) return;

    const baseScore = word.text.length * 10;
    const levelBonus = this.state.level * 5;
    this.state.score += baseScore + levelBonus;

    this.state.words.splice(index, 1);
    this.state.lockedWordIndex = null;
    this.state.currentInput = '';

    // 每 100 分升一级
    const newLevel = Math.floor(this.state.score / 100) + 1;
    if (newLevel > this.state.level) {
      this.state.level = newLevel;
    }

    this.onUpdate(this.state);
  }

  private spawnWord(): void {
    const text = VOCABULARY[Math.floor(Math.random() * VOCABULARY.length)];
    const padding = 60;
    const x = padding + Math.random() * (this.canvas.width - padding * 2);
    const speed = 0.8 + this.state.level * 0.25 + Math.random() * 0.5;
    this.state.words.push({ text, x, y: 0, speed, typedIndex: 0 });
  }

  private loop(now: number): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    const spawnInterval = Math.max(1200, 2500 - this.state.level * 200);
    if (now - this.lastSpawn > spawnInterval) {
      this.spawnWord();
      this.lastSpawn = now;
    }

    this.update();
    this.draw();

    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }

  private update(): void {
    for (let i = this.state.words.length - 1; i >= 0; i--) {
      const word = this.state.words[i];
      word.y += word.speed;

      if (word.y > this.canvas.height - 20) {
        this.state.words.splice(i, 1);
        if (this.state.lockedWordIndex === i) {
          this.state.lockedWordIndex = null;
          this.state.currentInput = '';
        } else if (this.state.lockedWordIndex !== null && this.state.lockedWordIndex > i) {
          this.state.lockedWordIndex -= 1;
        }

        this.state.lives -= 1;
        if (this.state.lives <= 0) {
          this.gameOver();
          return;
        }
        this.onUpdate(this.state);
      }
    }
  }

  private gameOver(): void {
    this.state.isRunning = false;
    cancelAnimationFrame(this.animationId);
    this.onGameOver(this.state.score);
    this.onUpdate(this.state);
  }

  private draw(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 背景网格
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // 危险线
    ctx.strokeStyle = '#f43f5e';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, height - 30);
    ctx.lineTo(width, height - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // 单词
    for (let i = 0; i < this.state.words.length; i++) {
      const word = this.state.words[i];
      const isLocked = i === this.state.lockedWordIndex;

      ctx.font = isLocked ? 'bold 26px sans-serif' : '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(word.text, word.x + 2, word.y + 2);

      // 已输入部分高亮
      const typed = word.text.slice(0, word.typedIndex);
      const untyped = word.text.slice(word.typedIndex);
      const fullWidth = ctx.measureText(word.text).width;
      const typedWidth = ctx.measureText(typed).width;
      const startX = word.x - fullWidth / 2;

      ctx.fillStyle = isLocked ? '#22c55e' : '#38bdf8';
      ctx.fillText(typed, startX + typedWidth / 2, word.y);

      ctx.fillStyle = isLocked ? '#fbbf24' : '#f8fafc';
      ctx.fillText(untyped, startX + typedWidth + ctx.measureText(untyped).width / 2, word.y);

      // 锁定框
      if (isLocked) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(word.x - fullWidth / 2 - 8, word.y - 18, fullWidth + 16, 36);
      }
    }

    if (!this.state.isRunning && this.state.lives <= 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', width / 2, height / 2 - 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '24px sans-serif';
      ctx.fillText(`最终得分: ${this.state.score}`, width / 2, height / 2 + 30);
    }
  }
}
