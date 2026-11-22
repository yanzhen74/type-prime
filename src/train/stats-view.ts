import type {
  GameSession,
  HeatmapKeyInfo,
  KeyStats,
  MasteryLevel,
  TrainingSession,
  WordStats,
} from '../core/types.js';
import type { UserProgress } from '../core/storage.js';
import type { VocabularyBank } from '../vocab/vocabulary.js';
import {
  buildKeyHeat,
  drillCharOf,
  summarizeKeys,
  topErrorWords,
  weakKeyCodes,
  ERROR_WORD_LIMIT,
  MIN_SAMPLE,
  WEAK_KEY_LIMIT,
  type KeyHeat,
} from './error-stats.js';

/** 错误分析视图依赖：数据源 + 布局注入 + 两个练习入口回调 */
export interface TrainStatsViewDeps {
  /** 热力图键盘布局（与缩略键盘同一份行数据，由 TrainPanel 注入） */
  rows: HeatmapKeyInfo[][];
  progress: UserProgress;
  vocabulary: VocabularyBank;
  /** 发起键位专项练习（单个键帽点击或「练习薄弱键位」） */
  onDrillKeys: (keys: string[]) => void;
  /** 发起易错词复习（复用今日复习链路，回写掌握度与记忆曲线） */
  onReviewWords: (wordIds: string[]) => void;
}

const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: '新词',
  learning: '学习中',
  reviewing: '复习中',
  mastered: '已掌握',
};

/** 练习/游戏会话的模式展示名（TrainingSession.mode 与 GameSession.mode 合并口径） */
const SESSION_MODE_LABELS: Record<string, string> = {
  key: '键位',
  free: '单词',
  article: '文章',
  falling: '单词掉落',
  shooter: '闯关射击',
  zombie: '僵尸大战',
};

/** 最近练习展示条数 */
const RECENT_SESSION_LIMIT = 8;

/** 标准键帽宽度单位（空格键按 width/44 比例放大，与缩略键盘几何一致） */
const KEY_WIDTH_UNIT = 44;

interface HeatCell {
  el: HTMLButtonElement;
  countEl: HTMLElement;
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`TrainStatsView: 未找到必需的 DOM 元素 #${id}`);
  }
  return el as T;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatSessionTime(startedAt: number): string {
  const d = new Date(startedAt);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 错误分析视图（训练面板第四个子标签）。
 *
 * 三块内容：错误键位热力图（DOM 键帽，颜色走 CSS 变量自动随主题换肤）、
 * 易错词列表（Top 10，可单词/批量发起复习）、最近练习记录。
 * 数据每次进入视图时从 UserProgress 重新聚合，不持有独立状态副本。
 */
export class TrainStatsView {
  private readonly deps: TrainStatsViewDeps;
  private readonly abort = new AbortController();
  private readonly cells = new Map<string, HeatCell>();
  /** 行优先展开的键帽列表，方向键漫游焦点用 */
  private readonly cellOrder: HTMLButtonElement[] = [];

  private summaryEl!: HTMLElement;
  private keyboardEl!: HTMLElement;
  private weakBtn!: HTMLButtonElement;
  private weakSummaryEl!: HTMLElement;
  private wordsBody!: HTMLElement;
  private wordsTableWrap!: HTMLElement;
  private wordsEmptyEl!: HTMLElement;
  private reviewWordsBtn!: HTMLButtonElement;
  private sessionsEl!: HTMLElement;
  private sessionsEmptyEl!: HTMLElement;
  private emptyBannerEl!: HTMLElement;

  constructor(deps: TrainStatsViewDeps) {
    this.deps = deps;
    this.cacheDom();
    this.buildKeyboard();
    this.bindEvents();
  }

  private cacheDom(): void {
    this.summaryEl = requireEl('stats-summary');
    this.keyboardEl = requireEl('heatmap-keyboard');
    this.weakBtn = requireEl<HTMLButtonElement>('stats-drill-weak-btn');
    this.weakSummaryEl = requireEl('stats-weak-summary');
    this.wordsBody = requireEl('stats-words-body');
    this.wordsTableWrap = requireEl('stats-words-table-wrap');
    this.wordsEmptyEl = requireEl('stats-words-empty');
    this.reviewWordsBtn = requireEl<HTMLButtonElement>('stats-review-words-btn');
    this.sessionsEl = requireEl('stats-sessions');
    this.sessionsEmptyEl = requireEl('stats-sessions-empty');
    this.emptyBannerEl = requireEl('stats-empty-banner');
  }

  /** 键帽只构建一次，refresh 只更新热力/计数/提示，避免重复建 DOM 与监听器 */
  private buildKeyboard(): void {
    const opts = { signal: this.abort.signal };
    this.keyboardEl.textContent = '';
    for (const row of this.deps.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'heat-row';
      for (const key of row) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'heat-key';
        cell.dataset.code = key.code;
        // 漫游焦点：仅首个键帽在 Tab 序内，其余用方向键到达
        cell.tabIndex = this.cellOrder.length === 0 ? 0 : -1;
        // 宽键（空格）按缩略键盘几何比例放大，其余键帽统一宽度
        if (key.width) {
          cell.style.width = `${((key.width / KEY_WIDTH_UNIT) * 2.55).toFixed(2)}em`;
        }

        const label = document.createElement('span');
        label.className = 'heat-key-label';
        label.textContent = key.label;
        const count = document.createElement('span');
        count.className = 'heat-key-count';
        cell.append(label, count);

        cell.addEventListener(
          'click',
          () => {
            const char = drillCharOf(key.code);
            if (char !== null) {
              this.deps.onDrillKeys([char]);
            }
          },
          opts
        );
        cell.addEventListener('focus', () => this.moveRovingFocus(cell), opts);

        this.cells.set(key.code, { el: cell, countEl: count });
        this.cellOrder.push(cell);
        rowEl.appendChild(cell);
      }
      this.keyboardEl.appendChild(rowEl);
    }

    // 方向键在键帽间漫游（全键盘无鼠标操作要求）
    this.keyboardEl.addEventListener(
      'keydown',
      (e) => {
        const deltas: Record<string, number> = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -1,
          ArrowDown: 1,
        };
        const delta = deltas[e.key];
        if (delta === undefined) {
          return;
        }
        const current = document.activeElement;
        const index = this.cellOrder.indexOf(current as HTMLButtonElement);
        if (index < 0) {
          return;
        }
        e.preventDefault();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // 上下移动按行跳转：找到当前行首，再偏移一行
          const rowOf = (el: HTMLElement): HTMLElement | null =>
            el.parentElement?.classList.contains('heat-row') ? el.parentElement : null;
          const row = rowOf(this.cellOrder[index]);
          const rows = [...this.keyboardEl.children] as HTMLElement[];
          const rowIdx = row ? rows.indexOf(row) : -1;
          const targetRow = rows[rowIdx + delta];
          if (!targetRow) {
            return;
          }
          const col = row ? [...row.children].indexOf(this.cellOrder[index]) : 0;
          const target = (targetRow.children[Math.min(col, targetRow.children.length - 1)] ??
            null) as HTMLButtonElement | null;
          target?.focus();
          return;
        }
        const next = this.cellOrder[index + delta];
        next?.focus();
      },
      opts
    );
  }

  private moveRovingFocus(cell: HTMLButtonElement): void {
    for (const other of this.cellOrder) {
      other.tabIndex = other === cell ? 0 : -1;
    }
  }

  private bindEvents(): void {
    const opts = { signal: this.abort.signal };
    this.weakBtn.addEventListener(
      'click',
      () => {
        const heat = buildKeyHeat(this.readKeyStats());
        const keys = weakKeyCodes(heat, WEAK_KEY_LIMIT)
          .map((code) => drillCharOf(code))
          .filter((c): c is string => c !== null);
        if (keys.length > 0) {
          this.deps.onDrillKeys(keys);
        }
      },
      opts
    );
    this.reviewWordsBtn.addEventListener(
      'click',
      () => {
        const ids = this.currentErrorWords().map((entry) => entry.word.id);
        if (ids.length > 0) {
          this.deps.onReviewWords(ids);
        }
      },
      opts
    );
  }

  private readKeyStats(): Record<string, KeyStats> {
    return (this.deps.progress.getKeyStats() as Record<string, KeyStats> | undefined) ?? {};
  }

  private readWordStats(): Record<string, WordStats> {
    return (this.deps.progress.getWordStats() as Record<string, WordStats> | undefined) ?? {};
  }

  private currentErrorWords(): ReturnType<typeof topErrorWords> {
    return topErrorWords(
      this.readWordStats(),
      (id) => this.deps.vocabulary.getWordById(id),
      ERROR_WORD_LIMIT
    );
  }

  /** 重新聚合当前用户数据并刷新全部区块（进入视图 / 切换用户后调用） */
  refresh(): void {
    const keyStats = this.readKeyStats();
    const heat = buildKeyHeat(keyStats);
    const summary = summarizeKeys(keyStats);
    const errorWords = this.currentErrorWords();
    const sessions = this.deps.progress.getCurrentUser()?.sessions ?? [];

    this.renderSummary(summary);
    this.renderHeat(heat);
    this.renderWeakActions(heat);
    this.renderWords(errorWords);
    this.renderSessions(sessions);

    const noData = summary.attempts === 0 && errorWords.length === 0 && sessions.length === 0;
    this.emptyBannerEl.style.display = noData ? '' : 'none';
  }

  private renderSummary(summary: ReturnType<typeof summarizeKeys>): void {
    this.summaryEl.textContent = '';
    const items: [string, string][] = [
      ['总击键', String(summary.attempts)],
      ['错误击键', String(summary.wrong)],
      ['整体正确率', summary.attempts > 0 ? percent(summary.accuracy) : '—'],
      ['覆盖键位', String(summary.coveredKeys)],
    ];
    for (const [label, value] of items) {
      const chip = document.createElement('div');
      chip.className = 'stats-chip';
      const labelEl = document.createElement('span');
      labelEl.className = 'stats-chip-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'stats-chip-value';
      valueEl.textContent = value;
      chip.append(labelEl, valueEl);
      this.summaryEl.appendChild(chip);
    }
  }

  private renderHeat(heat: Map<string, KeyHeat>): void {
    for (const [code, cell] of this.cells) {
      const h = heat.get(code);
      const wrong = h?.wrong ?? 0;
      const attempts = h?.attempts ?? 0;
      // 热力与熟键 tint 都走 CSS 变量（--danger-rgb / --success-rgb），随主题自动换肤
      cell.el.style.setProperty('--heat', (h?.intensity ?? 0).toFixed(3));
      cell.el.classList.toggle('is-solid', h?.solid ?? false);
      cell.el.classList.toggle('is-empty', !h?.hasData);
      cell.el.classList.toggle(
        'is-low-sample',
        h !== undefined && h.hasData && attempts < MIN_SAMPLE
      );
      cell.countEl.textContent = wrong > 0 ? String(wrong) : h?.solid ? '✓' : '';
      const label = cell.el.querySelector('.heat-key-label')?.textContent ?? code;
      const title = h?.hasData
        ? `${label} · 错误 ${wrong} / 击键 ${attempts} · 错误率 ${percent(h.errorRate)}${
            attempts < MIN_SAMPLE ? '（样本不足，热力已减弱）' : ''
          }`
        : `${label} · 暂无击键记录`;
      cell.el.title = title;
      cell.el.setAttribute('aria-label', `${title}，点击开始该键专项练习`);
    }
  }

  private renderWeakActions(heat: Map<string, KeyHeat>): void {
    const codes = weakKeyCodes(heat, WEAK_KEY_LIMIT);
    const chars = codes.map((code) => drillCharOf(code)).filter((c): c is string => c !== null);
    this.weakBtn.disabled = chars.length === 0;
    this.weakSummaryEl.textContent =
      chars.length > 0
        ? `推荐键位：${chars.map((c) => (c === ' ' ? '空格' : c.toUpperCase())).join(' ')}（按错误次数取前 ${WEAK_KEY_LIMIT} 个）`
        : '暂无错误键位记录，完成练习后这里会给出针对性推荐。';
  }

  private renderWords(entries: ReturnType<typeof topErrorWords>): void {
    this.wordsBody.textContent = '';
    const hasWords = entries.length > 0;
    this.wordsTableWrap.style.display = hasWords ? '' : 'none';
    this.wordsEmptyEl.style.display = hasWords ? 'none' : '';
    this.reviewWordsBtn.disabled = !hasWords;

    const opts = { signal: this.abort.signal };
    for (const entry of entries) {
      const tr = document.createElement('tr');

      const wordTd = document.createElement('td');
      wordTd.className = 'stats-word-text';
      wordTd.textContent = entry.word.text;
      tr.appendChild(wordTd);

      const meaningTd = document.createElement('td');
      meaningTd.className = 'stats-word-meaning';
      meaningTd.textContent = entry.word.meaning ?? '—';
      tr.appendChild(meaningTd);

      const wrongTd = document.createElement('td');
      wrongTd.className = 'stats-num is-wrong';
      wrongTd.textContent = String(entry.stats.wrong);
      tr.appendChild(wrongTd);

      const attemptsTd = document.createElement('td');
      attemptsTd.className = 'stats-num';
      attemptsTd.textContent = String(entry.stats.encounters);
      tr.appendChild(attemptsTd);

      const rateTd = document.createElement('td');
      rateTd.className = 'stats-num';
      rateTd.textContent = percent(entry.errorRate);
      tr.appendChild(rateTd);

      const masteryTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `mastery-badge mastery-${entry.stats.mastery}`;
      badge.textContent = MASTERY_LABELS[entry.stats.mastery] ?? MASTERY_LABELS.new;
      masteryTd.appendChild(badge);
      tr.appendChild(masteryTd);

      const actionTd = document.createElement('td');
      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = 'btn btn-small';
      reviewBtn.textContent = '复习';
      reviewBtn.addEventListener('click', () => this.deps.onReviewWords([entry.word.id]), opts);
      actionTd.appendChild(reviewBtn);
      tr.appendChild(actionTd);

      this.wordsBody.appendChild(tr);
    }
  }

  private renderSessions(sessions: (TrainingSession | GameSession)[]): void {
    this.sessionsEl.textContent = '';
    const recent = sessions.slice(-RECENT_SESSION_LIMIT).reverse();
    const hasSessions = recent.length > 0;
    this.sessionsEl.style.display = hasSessions ? '' : 'none';
    this.sessionsEmptyEl.style.display = hasSessions ? 'none' : '';

    for (const session of recent) {
      const row = document.createElement('div');
      row.className = 'stats-session-row';

      const mode = document.createElement('span');
      mode.className = `session-badge ${session.type === 'game' ? 'is-game' : 'is-training'}`;
      mode.textContent = SESSION_MODE_LABELS[session.mode] ?? session.mode;
      row.appendChild(mode);

      const accuracy = document.createElement('span');
      accuracy.className = 'stats-session-metric';
      accuracy.textContent = `正确率 ${Math.round(session.accuracy)}%`;
      row.appendChild(accuracy);

      const metric = document.createElement('span');
      metric.className = 'stats-session-metric';
      metric.textContent =
        session.type === 'training' ? `${Math.round(session.wpm)} WPM` : `${session.score} 分`;
      row.appendChild(metric);

      const time = document.createElement('span');
      time.className = 'stats-session-time';
      time.textContent = formatSessionTime(session.startedAt);
      row.appendChild(time);

      this.sessionsEl.appendChild(row);
    }
  }

  /** 释放监听器（随 TrainPanel.destroy 调用） */
  dispose(): void {
    this.abort.abort();
  }
}
