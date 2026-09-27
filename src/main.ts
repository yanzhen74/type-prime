import { UserStorage } from './storage.js';
import { KeyboardRenderer } from './keyboard.js';
import { FallingWordGame } from './game.js';
import type { GameState } from './types.js';

class App {
  private storage: UserStorage;
  private keyboard: KeyboardRenderer;
  private game: FallingWordGame;

  private userSelect = document.getElementById('user-select') as HTMLSelectElement;
  private btnAddUser = document.getElementById('btn-add-user') as HTMLButtonElement;
  private tabButtons = document.querySelectorAll('.tab-btn');
  private panels = document.querySelectorAll('.panel');

  private scoreEl = document.getElementById('score') as HTMLElement;
  private livesEl = document.getElementById('lives') as HTMLElement;
  private levelEl = document.getElementById('level') as HTMLElement;
  private mistakesEl = document.getElementById('mistakes') as HTMLElement;
  private accuracyEl = document.getElementById('accuracy') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  private btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
  private rankBody = document.querySelector('#rank-table tbody') as HTMLElement;

  constructor() {
    this.storage = new UserStorage();
    this.keyboard = new KeyboardRenderer('keyboard-container', 'finger-hint');
    this.game = new FallingWordGame(
      'game-canvas',
      (state) => this.onGameUpdate(state),
      (score) => this.onGameOver(score)
    );

    this.initTabs();
    this.initUserControls();
    this.initGameControls();
    this.initKeyboardInput();
    this.renderUserSelect();
    this.renderRank();
  }

  private initTabs(): void {
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (!tab) return;

        this.tabButtons.forEach((b) => b.classList.remove('active'));
        this.panels.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const panel = document.getElementById(`panel-${tab}`);
        panel?.classList.add('active');
      });
    });
  }

  private initUserControls(): void {
    this.userSelect.addEventListener('change', () => {
      this.storage.setCurrentUser(this.userSelect.value);
      this.renderRank();
    });

    this.btnAddUser.addEventListener('click', () => {
      const name = window.prompt('请输入新用户名称：');
      if (!name || name.trim() === '') return;
      const user = this.storage.addUser(name.trim());
      this.renderUserSelect();
      this.storage.setCurrentUser(user.id);
      this.userSelect.value = user.id;
      this.renderRank();
    });
  }

  private initGameControls(): void {
    this.btnStart.addEventListener('click', () => this.game.start());
    this.btnPause.addEventListener('click', () => this.game.pause());
    this.btnReset.addEventListener('click', () => this.game.reset());
  }

  private initKeyboardInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.game.pause();
        return;
      }

      this.keyboard.highlight(e.code);

      if (!this.isGamePanelActive()) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        this.game.handleBackspace();
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        e.preventDefault();
        this.game.handleInput(e.key.toLowerCase());
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.game.submitWord();
      }
    });
  }

  private isGamePanelActive(): boolean {
    return document.getElementById('panel-game')?.classList.contains('active') ?? false;
  }

  private onGameUpdate(state: GameState): void {
    this.scoreEl.textContent = String(state.score);
    this.livesEl.textContent = String(state.lives);
    this.levelEl.textContent = String(state.level);
    this.mistakesEl.textContent = String(state.mistakes);
    this.accuracyEl.textContent = this.computeAccuracy(state);
    this.btnPause.textContent = state.isPaused ? '继续' : '暂停';
  }

  private computeAccuracy(state: GameState): string {
    const total = state.score / 10 + state.mistakes;
    if (total === 0) return '100%';
    const accuracy = (state.score / 10 / total) * 100;
    return `${accuracy.toFixed(1)}%`;
  }

  private onGameOver(score: number): void {
    this.storage.updateScore(score);
    this.renderRank();
    window.alert(`游戏结束！得分：${score}`);
  }

  private renderUserSelect(): void {
    const current = this.storage.getCurrentUser();
    this.userSelect.innerHTML = '';
    for (const user of this.storage.getUsers()) {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.name} (最高:${user.highScore})`;
      this.userSelect.appendChild(option);
    }
    if (current) {
      this.userSelect.value = current.id;
    }
  }

  private renderRank(): void {
    const users = [...this.storage.getUsers()].sort((a, b) => b.highScore - a.highScore);
    this.rankBody.innerHTML = '';
    for (const user of users) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${user.name}</td>
        <td>${user.highScore}</td>
        <td>${user.totalGames}</td>
      `;
      this.rankBody.appendChild(tr);
    }
  }
}

new App();
