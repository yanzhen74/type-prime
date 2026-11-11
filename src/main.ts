import { UserProgress } from './storage.js';
import { KeyboardRenderer } from './keyboard.js';
import { FallingWordGame, type GameOptions } from './game.js';
import { TypingShooterGame } from './typing-shooter-game.js';
import { ZombieTypingGame } from './zombie-typing-game.js';
import { TypingEngine } from './input.js';
import { TrainPanel } from './train-panel.js';
import { VocabularyBank } from './vocabulary.js';
import { ReviewScheduler } from './review.js';
import { VocabPanel } from './vocab-panel.js';
import { Dialog } from './dialog.js';
import type { GameBaseState } from './types.js';

/** 游戏难度设置（持久化到 localStorage） */
interface GameSettings {
  /** 游戏模式：单词掉落 / 闯关射击 / 僵尸大战 */
  mode: 'falling' | 'shooter' | 'zombie';
  startingLevel: number;
  speedMultiplier: number;
  wordSource: 'builtin' | 'vocab';
}

const GAME_SETTINGS_KEY = 'typeprime_game_settings';

const DEFAULT_GAME_SETTINGS: GameSettings = {
  mode: 'falling',
  startingLevel: 1,
  speedMultiplier: 1,
  wordSource: 'builtin',
};

class App {
  private storage: UserProgress;
  private keyboard: KeyboardRenderer | null = null;
  private game: FallingWordGame | TypingShooterGame | ZombieTypingGame;
  private vocabulary: VocabularyBank;
  private review: ReviewScheduler;
  private typingEngine: TypingEngine;
  private trainPanel: TrainPanel;
  private vocabPanel: VocabPanel;
  /** 训练面板隐藏输入框（#train-input），元素缺失时为 null，仅用于焦点管理 */
  private trainInput: HTMLInputElement | null = null;
  private helpModal: HTMLElement | null = null;
  /** 页内模态对话框，替代被沙箱 iframe 禁用的 window.prompt/alert */
  private dialog = new Dialog();

  private userSelect = document.getElementById('user-select') as HTMLSelectElement;
  private btnAddUser = document.getElementById('btn-add-user') as HTMLButtonElement;
  private tabButtons = document.querySelectorAll('.tab-btn');
  private panels = document.querySelectorAll('.panel');
  private gameInput = document.getElementById('game-input') as HTMLInputElement;

  private scoreEl = document.getElementById('score') as HTMLElement;
  private livesEl = document.getElementById('lives') as HTMLElement;
  private levelEl = document.getElementById('level') as HTMLElement;
  private mistakesEl = document.getElementById('mistakes') as HTMLElement;
  private accuracyEl = document.getElementById('accuracy') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  private btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
  private rankBody = document.querySelector('#rank-table tbody') as HTMLElement;

  // 游戏难度设置控件
  private gameStartLevel = document.getElementById('game-start-level') as HTMLSelectElement;
  private gameSpeed = document.getElementById('game-speed') as HTMLSelectElement;
  private gameWordSource = document.getElementById('game-word-source') as HTMLSelectElement;
  private gameModeSelect = document.getElementById('game-mode') as HTMLSelectElement;
  /** 游戏面板设置控件持有焦点时为 true，用于抑制 #game-input 失焦自动重聚焦抢夺下拉焦点 */
  private gameControlFocused = false;

  constructor() {
    this.storage = new UserProgress();
    // 旧版训练面板 DOM（keyboard-container / finger-hint / hands-diagram）已随
    // #panel-train 重构移除，元素存在时才初始化旧渲染器，避免阻塞整个应用启动。
    if (
      document.getElementById('keyboard-container') &&
      document.getElementById('finger-hint') &&
      document.getElementById('hands-diagram')
    ) {
      this.keyboard = new KeyboardRenderer('keyboard-container', 'finger-hint', 'hands-diagram');
    }

    // 指法训练面板：词库 + 统一输入引擎 + 面板协调器。
    // 输入引擎优先绑定 #train-input 隐藏输入框；元素缺失时由 TypingEngine
    // 自建隐藏输入框兜底，保证训练功能仍可用。
    this.vocabulary = new VocabularyBank();
    this.review = new ReviewScheduler();
    const trainInputEl = document.getElementById('train-input');
    this.trainInput = trainInputEl instanceof HTMLInputElement ? trainInputEl : null;
    this.typingEngine = this.trainInput ? new TypingEngine(this.trainInput) : new TypingEngine();
    this.trainPanel = new TrainPanel({
      typingEngine: this.typingEngine,
      keyboard: this.keyboard,
      vocabulary: this.vocabulary,
      progress: this.storage,
      review: this.review,
      currentUser: () => this.storage.getCurrentUser()?.name ?? 'Guest',
    });
    this.vocabPanel = new VocabPanel({
      vocabulary: this.vocabulary,
      review: this.review,
      progress: this.storage,
      onStartReview: (wordIds) => this.startReview(wordIds),
    });

    const gameSettings = this.loadGameSettings();
    this.applySettingsToControls(gameSettings);
    this.game = this.createGame(gameSettings);

    this.helpModal = document.getElementById('help-modal');

    this.initTabs();
    this.initUserControls();
    this.initGameControls();
    this.initGameSettings();
    this.initKeyboardInput();
    this.initGlobalShortcuts();
    this.renderUserSelect();
    this.renderRank();
  }

  private initTabs(): void {
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });
  }

  /** 切换到指定面板（train / game / rank） */
  private switchTab(tab: string): void {
    this.tabButtons.forEach((b) => b.classList.remove('active'));
    this.panels.forEach((p) => p.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    activeBtn?.classList.add('active');
    const panel = document.getElementById(`panel-${tab}`);
    panel?.classList.add('active');

    if (tab === 'train') {
      this.focusTrainInput();
    } else {
      // 切离训练面板时禁用隐藏输入框，避免其失焦自动重聚焦与游戏输入框
      // 互相争抢焦点（详见 suspendTrainInput 注释）。
      this.suspendTrainInput();
      if (tab === 'game') {
        this.focusGameInput();
      } else if (tab === 'vocab') {
        this.vocabPanel.refresh();
      }
    }
  }

  private initUserControls(): void {
    this.userSelect.addEventListener('change', () => {
      this.storage.setCurrentUser(this.userSelect.value);
      this.renderRank();
      this.vocabPanel.refresh();
      this.resetTrainPanel();
      this.releaseUserControlFocus();
    });

    // 下拉展开期间需要持续持有焦点：交互期间临时禁用隐藏输入框，
    // 避免 TypingEngine 的失焦自动重聚焦关闭下拉弹层。
    this.userSelect.addEventListener('focus', () => this.suspendTrainInput());
    this.userSelect.addEventListener('blur', () => this.releaseUserControlFocus());

    this.btnAddUser.addEventListener('click', () => {
      void this.handleAddUser();
    });

    // 训练面板内 select / textarea 焦点保护：交互期间禁用隐藏输入框，
    // 避免 TypingEngine 的失焦自动重聚焦抢夺用户正在操作的控件焦点。
    const levelSelector = document.getElementById('level-selector');
    levelSelector?.addEventListener('focus', () => this.suspendTrainInput());
    levelSelector?.addEventListener('blur', () => this.releaseUserControlFocus());

    const articleTextarea = document.getElementById('article-textarea');
    articleTextarea?.addEventListener('focus', () => this.suspendTrainInput());
    articleTextarea?.addEventListener('blur', () => this.releaseUserControlFocus());

    // 文章库下拉框焦点保护（与 levelSelector 同理）
    const articleSelect = document.getElementById('article-select');
    articleSelect?.addEventListener('focus', () => this.suspendTrainInput());
    articleSelect?.addEventListener('blur', () => this.releaseUserControlFocus());

    // 单词练习词库选择控件焦点保护：分类勾选框为动态生成，
    // 用 focusin/focusout 委托到容器（focus/blur 不冒泡，focusin/focusout 冒泡）。
    const wordSelect = document.getElementById('train-word-select');
    wordSelect?.addEventListener('focusin', () => this.suspendTrainInput());
    wordSelect?.addEventListener('focusout', () => this.releaseUserControlFocus());
  }

  /**
   * 弹出输入对话框获取用户名并新增用户。
   * 交互期间禁用隐藏输入框，避免 TypingEngine 自动重聚焦抢走对话框焦点。
   */
  private async handleAddUser(): Promise<void> {
    this.suspendTrainInput();
    const result = await this.dialog.open({
      title: '添加用户',
      input: { label: '用户名', placeholder: '请输入新用户名称' },
      okText: '添加',
      cancelText: '取消',
    });
    this.releaseUserControlFocus();
    if (!result.confirmed) {
      return;
    }
    const name = result.value.trim();
    if (name === '') {
      return;
    }
    const user = this.storage.addUser(name);
    this.renderUserSelect();
    this.storage.setCurrentUser(user.id);
    this.userSelect.value = user.id;
    this.renderRank();
    this.vocabPanel.refresh();
    this.resetTrainPanel();
  }

  /** 弹出仅含确认按钮的提示对话框（替代 window.alert） */
  private async alertUser(message: string, title = '提示'): Promise<void> {
    this.suspendTrainInput();
    await this.dialog.open({ title, message, showCancel: false, okText: '知道了' });
    this.releaseUserControlFocus();
  }

  private initGameControls(): void {
    this.btnStart.addEventListener('click', () => {
      this.game.start();
      this.focusGameInput();
    });
    this.btnPause.addEventListener('click', () => this.game.pause());
    this.btnReset.addEventListener('click', () => this.game.reset());
  }

  // -------------------------------------------------------------------------
  // 游戏难度设置（起始等级 / 速度倍率 / 词源）
  // -------------------------------------------------------------------------

  private initGameSettings(): void {
    const controls = [
      this.gameModeSelect,
      this.gameStartLevel,
      this.gameSpeed,
      this.gameWordSource,
    ];
    for (const control of controls) {
      control.addEventListener('change', () => this.handleGameSettingChange());
      // 焦点保护：设置控件展开期间置位 gameControlFocused，抑制 #game-input
      // 失焦自动重聚焦抢夺下拉焦点；blur 时把焦点交还游戏输入框。
      control.addEventListener('focus', () => {
        this.gameControlFocused = true;
      });
      control.addEventListener('blur', () => {
        this.gameControlFocused = false;
        if (this.isGamePanelActive()) {
          this.focusGameInput();
        }
      });
    }
  }

  /** 设置变更：持久化并重建当前模式的游戏实例（重置当前局） */
  private handleGameSettingChange(): void {
    const settings = this.readGameSettings();
    this.saveGameSettings(settings);
    this.game = this.createGame(settings);
    this.syncWordSourceDisabled(settings);
  }

  /** 按设置构造对应模式的游戏实例 */
  private createGame(
    settings: GameSettings
  ): FallingWordGame | TypingShooterGame | ZombieTypingGame {
    const onUpdate = (state: GameBaseState) => this.onGameUpdate(state);
    const onGameOver = (score: number) => this.onGameOver(score);
    if (settings.mode === 'shooter') {
      return new TypingShooterGame('game-canvas', onUpdate, onGameOver, {
        startingLevel: settings.startingLevel,
        speedMultiplier: settings.speedMultiplier,
      });
    }
    if (settings.mode === 'zombie') {
      return new ZombieTypingGame('game-canvas', onUpdate, onGameOver, {
        startingLevel: settings.startingLevel,
        speedMultiplier: settings.speedMultiplier,
      });
    }
    return new FallingWordGame(
      'game-canvas',
      onUpdate,
      onGameOver,
      this.buildGameOptions(settings)
    );
  }

  /** 闯关射击/僵尸大战不使用词库词源，禁用该下拉避免误导 */
  private syncWordSourceDisabled(settings: GameSettings): void {
    this.gameWordSource.disabled = settings.mode !== 'falling';
  }

  private loadGameSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(GAME_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        return {
          mode: parsed.mode === 'shooter' || parsed.mode === 'zombie' ? parsed.mode : 'falling',
          startingLevel: parsed.startingLevel ?? DEFAULT_GAME_SETTINGS.startingLevel,
          speedMultiplier: parsed.speedMultiplier ?? DEFAULT_GAME_SETTINGS.speedMultiplier,
          wordSource: parsed.wordSource === 'vocab' ? 'vocab' : 'builtin',
        };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_GAME_SETTINGS };
  }

  private saveGameSettings(settings: GameSettings): void {
    localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(settings));
  }

  private applySettingsToControls(settings: GameSettings): void {
    this.gameModeSelect.value = settings.mode;
    this.gameStartLevel.value = String(settings.startingLevel);
    this.gameSpeed.value = String(settings.speedMultiplier);
    this.gameWordSource.value = settings.wordSource;
    this.syncWordSourceDisabled(settings);
  }

  private readGameSettings(): GameSettings {
    const level = Number(this.gameStartLevel.value);
    const speed = Number(this.gameSpeed.value);
    return {
      mode:
        this.gameModeSelect.value === 'shooter' || this.gameModeSelect.value === 'zombie'
          ? this.gameModeSelect.value
          : 'falling',
      startingLevel: Number.isFinite(level) && level >= 1 ? level : 1,
      speedMultiplier: Number.isFinite(speed) && speed > 0 ? speed : 1,
      wordSource: this.gameWordSource.value === 'vocab' ? 'vocab' : 'builtin',
    };
  }

  private buildGameOptions(settings: GameSettings): GameOptions {
    return {
      startingLevel: settings.startingLevel,
      speedMultiplier: settings.speedMultiplier,
      wordProvider: settings.wordSource === 'vocab' ? this.makeVocabWordProvider() : undefined,
    };
  }

  /** 词库词源提供者：缓存词库单词文本并随机返回；词库为空时返回空串（由游戏回退内置词表） */
  private makeVocabWordProvider(): () => string {
    let cache: string[] = [];
    return () => {
      if (cache.length === 0) {
        cache = this.vocabulary.getWords().map((w) => w.text);
      }
      if (cache.length === 0) {
        return '';
      }
      return cache[Math.floor(Math.random() * cache.length)];
    };
  }

  private focusGameInput(): void {
    if (this.isGamePanelActive()) {
      this.gameInput.focus();
    }
  }

  private isTrainPanelActive(): boolean {
    return document.getElementById('panel-train')?.classList.contains('active') ?? false;
  }

  /** 切回训练面板时恢复隐藏输入框可用并聚焦（实际聚焦由 TypingEngine 延迟执行） */
  private focusTrainInput(): void {
    if (this.trainInput) {
      this.trainInput.disabled = false;
    }
    this.typingEngine.focus();
  }

  /**
   * 切离训练面板（或顶栏交互期间）禁用隐藏输入框。
   *
   * TypingEngine 监听 #train-input 的 blur 并自动重新聚焦（保证训练连续捕获输入）；
   * 若游戏面板 #game-input 同时处于失焦自动重聚焦状态，两者会互相抢焦点形成无限
   * focus/blur 循环。disabled 的输入框无法被程序化聚焦，据此阻断争抢，
   * 且不销毁训练引擎状态。
   */
  private suspendTrainInput(): void {
    if (this.trainInput) {
      this.trainInput.disabled = true;
    }
  }

  /** 顶栏用户控件交互结束后交还焦点：训练面板回训练输入框，游戏面板回游戏输入框 */
  private releaseUserControlFocus(): void {
    if (this.isTrainPanelActive()) {
      this.focusTrainInput();
    } else if (this.isGamePanelActive()) {
      this.focusGameInput();
    }
  }

  /**
   * 切换用户时重置训练面板：丢弃进行中的练习并刷新预览，
   * 避免上一位用户未完成练习的统计记入新用户。
   * TrainPanel 未暴露公开重置方法，此处调用其内部重置实现。
   */
  private resetTrainPanel(): void {
    (this.trainPanel as unknown as { resetPractice(): void }).resetPractice();
  }

  /** 从词库面板发起「今日复习」：切换到训练面板并开始复习练习 */
  private startReview(wordIds: string[]): void {
    this.switchTab('train');
    const started = this.trainPanel.startReview(wordIds);
    if (!started) {
      void this.alertUser('没有可复习的单词。', '今日复习');
    }
  }

  private initKeyboardInput(): void {
    // 指法训练面板的输入转发与按键反馈已由 TrainPanel 经 TypingEngine 接管，
    // 此处仅保留游戏面板输入逻辑。
    window.addEventListener('keydown', (e) => {
      if (!this.isGamePanelActive()) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        this.game.handleBackspace();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        // Enter/Space 在游戏运行中提交单词，在未运行时由 initGlobalShortcuts 处理开始
        if (this.game.isRunning()) {
          e.preventDefault();
          this.game.submitWord();
        }
      }
    });

    // 使用 input 事件捕获实际输入字符，兼容中文输入法等 IME 场景
    this.gameInput.addEventListener('input', (e) => {
      if (!this.isGamePanelActive()) return;

      const inputEvent = e as InputEvent;
      const data = inputEvent.data;
      if (data) {
        for (const char of data) {
          if (char !== ' ') {
            this.game.handleChar(char.toLowerCase());
          }
        }
      }

      // 清空输入框，避免累积字符影响下一次输入判断
      this.gameInput.value = '';
    });

    // 防止输入框失去焦点后无法接收输入（设置控件持有焦点或模态对话框打开时不抢回，
    // 避免打断下拉操作或抢走对话框输入框焦点）
    this.gameInput.addEventListener('blur', () => {
      if (this.isGamePanelActive()) {
        window.setTimeout(() => {
          if (this.isGamePanelActive() && !this.gameControlFocused && !this.dialog.isOpen()) {
            this.focusGameInput();
          }
        }, 0);
      }
    });
  }

  private isGamePanelActive(): boolean {
    return document.getElementById('panel-game')?.classList.contains('active') ?? false;
  }

  private onGameUpdate(state: GameBaseState): void {
    this.scoreEl.textContent = String(state.score);
    this.livesEl.textContent = String(state.lives);
    this.levelEl.textContent = String(state.level);
    this.mistakesEl.textContent = String(state.mistakes);
    this.accuracyEl.textContent = this.computeAccuracy(state);
    this.btnPause.innerHTML = state.isPaused ? '继续 <kbd>Ctrl+P</kbd>' : '暂停 <kbd>Ctrl+P</kbd>';
  }

  private computeAccuracy(state: GameBaseState): string {
    // 闯关射击提供精确的正确字符数；单词掉落以得分/10 近似正确字符数
    const correct =
      'correctChars' in state ? (state as { correctChars: number }).correctChars : state.score / 10;
    const total = correct + state.mistakes;
    if (total === 0) return '100%';
    const accuracy = (correct / total) * 100;
    return `${accuracy.toFixed(1)}%`;
  }

  private onGameOver(score: number): void {
    this.storage.updateScore(score);
    this.renderRank();
    void this.alertUser(`游戏结束！得分：${score}`, '游戏结束');
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

  // -------------------------------------------------------------------------
  // 全局快捷键系统
  // -------------------------------------------------------------------------

  private initGlobalShortcuts(): void {
    // 使用捕获阶段确保全局快捷键优先于 TypingEngine 的冒泡阶段监听器。
    // 处理按键后调用 stopPropagation 阻止事件继续传播。
    window.addEventListener(
      'keydown',
      (e) => {
        // 模态对话框打开时由其自行处理键盘（Enter 确认 / Esc 取消），此处全部放行
        if (this.dialog.isOpen()) {
          return;
        }

        // F1: 切换帮助弹窗（最高优先级）
        if (e.key === 'F1') {
          e.preventDefault();
          e.stopPropagation();
          this.toggleHelp();
          return;
        }

        // Escape: 关闭帮助弹窗 > 游戏面板重置
        if (e.key === 'Escape') {
          if (this.isHelpOpen()) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleHelp();
            return;
          }
          if (this.isGamePanelActive()) {
            e.preventDefault();
            e.stopPropagation();
            this.game.reset();
            this.focusGameInput();
            return;
          }
          // 训练面板的 Escape 由 TypingEngine -> TrainPanel 处理，不拦截
          return;
        }

        // 以下快捷键在帮助弹窗打开时不响应
        if (this.isHelpOpen()) {
          // 帮助弹窗打开时拦截所有带修饰键的组合，避免干扰
          if (e.ctrlKey || e.altKey) {
            e.stopPropagation();
          }
          return;
        }

        // 不拦截 textarea / select 内的组合键（除 Ctrl+数字面板切换外）
        const target = e.target as HTMLElement | null;
        const targetTag = target?.tagName?.toLowerCase();
        const isEditableTarget =
          targetTag === 'textarea' || targetTag === 'select' || target?.isContentEditable;

        // Ctrl+1/2/3/4: 切换顶级面板（即使焦点在 select/textarea 也生效）
        if (e.ctrlKey && !e.altKey && !e.shiftKey) {
          const panelMap: Record<string, string> = {
            '1': 'train',
            '2': 'game',
            '3': 'vocab',
            '4': 'rank',
          };
          const panel = panelMap[e.key];
          if (panel) {
            e.preventDefault();
            e.stopPropagation();
            this.switchTab(panel);
            return;
          }
        }

        // Ctrl+P: 游戏面板暂停/继续
        if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') {
          if (this.isGamePanelActive()) {
            e.preventDefault();
            e.stopPropagation();
            this.game.pause();
            this.focusGameInput();
            return;
          }
        }

        // Ctrl+Shift+U: 循环切换用户
        if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          e.stopPropagation();
          this.cycleUser();
          return;
        }

        // Ctrl+↑/↓: 训练面板层级切换
        if (
          e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown')
        ) {
          if (this.isTrainPanelActive()) {
            e.preventDefault();
            e.stopPropagation();
            this.trainPanel.cycleLevel(e.key === 'ArrowUp' ? -1 : 1);
            return;
          }
        }

        // Enter: 游戏面板未运行时开始游戏
        if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !isEditableTarget) {
          if (this.isGamePanelActive() && !this.game.isRunning()) {
            e.preventDefault();
            e.stopPropagation();
            this.game.start();
            this.focusGameInput();
            return;
          }
        }
      },
      true
    ); // capture phase
  }

  private isHelpOpen(): boolean {
    if (!this.helpModal) return false;
    return this.helpModal.style.display === 'flex';
  }

  private toggleHelp(): void {
    if (!this.helpModal) return;
    if (this.isHelpOpen()) {
      this.helpModal.style.display = 'none';
      // 关闭后恢复焦点
      if (this.isTrainPanelActive()) {
        this.focusTrainInput();
      } else if (this.isGamePanelActive()) {
        this.focusGameInput();
      }
    } else {
      this.suspendTrainInput();
      this.helpModal.style.display = 'flex';
    }
  }

  private cycleUser(): void {
    const users = this.storage.getUsers();
    if (users.length <= 1) return;
    const current = this.storage.getCurrentUser();
    const currentIdx = current ? users.findIndex((u) => u.id === current.id) : -1;
    const nextIdx = (currentIdx + 1) % users.length;
    const nextUser = users[nextIdx];
    this.storage.setCurrentUser(nextUser.id);
    this.userSelect.value = nextUser.id;
    this.renderRank();
    this.vocabPanel.refresh();
    this.resetTrainPanel();
  }
}

new App();
