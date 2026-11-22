import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrainStatsView } from './stats-view.js';
import type { UserProgress } from '../core/storage.js';
import type { VocabularyBank } from '../vocab/vocabulary.js';
import type {
  GameSession,
  HeatmapKeyInfo,
  KeyStats,
  TrainingSession,
  WordEntry,
  WordStats,
} from '../core/types.js';

/** 两行小键盘布局：字母行 + 空格行，覆盖普通键帽与宽键两条渲染路径 */
const ROWS: HeatmapKeyInfo[][] = [
  [
    { label: 'A', code: 'KeyA', finger: 'pinky', hand: 'left' },
    { label: 'S', code: 'KeyS', finger: 'ring', hand: 'left' },
    { label: 'J', code: 'KeyJ', finger: 'index', hand: 'right' },
  ],
  [{ label: 'Space', code: 'Space', finger: 'thumb', hand: 'right', width: 280 }],
];

const WORDS: WordEntry[] = [
  { id: 'w1', text: 'apple', difficulty: 1, category: 'daily', meaning: '苹果' },
  { id: 'w2', text: 'banana', difficulty: 2, category: 'daily' },
];

function makeWordStats(partial: Partial<WordStats>): WordStats {
  return {
    encounters: 0,
    correct: 0,
    wrong: 0,
    lastReview: 0,
    nextReview: 0,
    mastery: 'learning',
    ...partial,
  };
}

interface Stubs {
  keyStats: Record<string, KeyStats>;
  wordStats: Record<string, WordStats>;
  sessions: (TrainingSession | GameSession)[];
}

function mountFixture(): void {
  document.body.innerHTML = `
    <div id="train-stats-view">
      <div id="stats-empty-banner" style="display:none"></div>
      <div id="stats-summary"></div>
      <div id="heatmap-keyboard"></div>
      <button id="stats-drill-weak-btn" disabled></button>
      <span id="stats-weak-summary"></span>
      <div id="stats-words-table-wrap"><table><tbody id="stats-words-body"></tbody></table></div>
      <div id="stats-words-empty" style="display:none"></div>
      <button id="stats-review-words-btn" disabled></button>
      <div id="stats-sessions"></div>
      <div id="stats-sessions-empty" style="display:none"></div>
    </div>
  `;
}

function makeProgress(stubs: Stubs): UserProgress {
  return {
    getKeyStats: () => stubs.keyStats,
    getWordStats: () => stubs.wordStats,
    getCurrentUser: () => ({ sessions: stubs.sessions }),
  } as unknown as UserProgress;
}

function makeVocab(): VocabularyBank {
  return {
    getWordById: (id: string) => WORDS.find((w) => w.id === id),
  } as unknown as VocabularyBank;
}

function setup(stubs: Stubs): {
  view: TrainStatsView;
  onDrillKeys: ReturnType<typeof vi.fn>;
  onReviewWords: ReturnType<typeof vi.fn>;
} {
  const onDrillKeys = vi.fn();
  const onReviewWords = vi.fn();
  const view = new TrainStatsView({
    rows: ROWS,
    progress: makeProgress(stubs),
    vocabulary: makeVocab(),
    onDrillKeys,
    onReviewWords,
  });
  return { view, onDrillKeys, onReviewWords };
}

function cell(code: string): HTMLButtonElement {
  return document.querySelector(`.heat-key[data-code="${code}"]`) as HTMLButtonElement;
}

beforeEach(() => {
  localStorage.clear();
  mountFixture();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TrainStatsView 热力图渲染', () => {
  it('按错误率写入 --heat 强度与错误计数，无数据键帽标记 is-empty', () => {
    const { view } = setup({
      keyStats: { KeyA: { correct: 15, wrong: 5 }, KeyS: { correct: 6, wrong: 0 } },
      wordStats: {},
      sessions: [],
    });
    view.refresh();

    const a = cell('KeyA');
    expect(a.style.getPropertyValue('--heat')).toBe('0.500');
    expect(a.querySelector('.heat-key-count')!.textContent).toBe('5');
    expect(a.title).toContain('错误率 25%');

    const s = cell('KeyS');
    expect(s.classList.contains('is-solid')).toBe(true);
    expect(s.querySelector('.heat-key-count')!.textContent).toBe('✓');

    expect(cell('KeyJ').classList.contains('is-empty')).toBe(true);
    view.dispose();
  });

  it('概览 chips 汇总总击键/错误/正确率/覆盖键位', () => {
    const { view } = setup({
      keyStats: { KeyA: { correct: 8, wrong: 2 } },
      wordStats: {},
      sessions: [],
    });
    view.refresh();
    const values = [...document.querySelectorAll('.stats-chip-value')].map((el) => el.textContent);
    expect(values).toEqual(['10', '2', '80%', '1']);
    view.dispose();
  });

  it('点击键帽以该键字符发起专项练习', () => {
    const { view, onDrillKeys } = setup({ keyStats: {}, wordStats: {}, sessions: [] });
    view.refresh();
    cell('KeyA').click();
    expect(onDrillKeys).toHaveBeenCalledWith(['a']);
    cell('Space').click();
    expect(onDrillKeys).toHaveBeenCalledWith([' ']);
    view.dispose();
  });

  it('方向键在键帽间漫游焦点（含跨行）', () => {
    const { view } = setup({ keyStats: {}, wordStats: {}, sessions: [] });
    view.refresh();
    const a = cell('KeyA');
    a.focus();
    expect(a.tabIndex).toBe(0);
    expect(cell('KeyS').tabIndex).toBe(-1);

    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cell('KeyS'));

    cell('KeyS').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(cell('Space'));
    view.dispose();
  });
});

describe('TrainStatsView 薄弱键位推荐', () => {
  it('按钮取错误次数最高的键位发起练习，并展示推荐文案', () => {
    const { view, onDrillKeys } = setup({
      keyStats: { KeyA: { correct: 0, wrong: 2 }, KeyJ: { correct: 0, wrong: 7 } },
      wordStats: {},
      sessions: [],
    });
    view.refresh();
    const btn = document.getElementById('stats-drill-weak-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(document.getElementById('stats-weak-summary')!.textContent).toContain('J A');
    btn.click();
    expect(onDrillKeys).toHaveBeenCalledWith(['j', 'a']);
    view.dispose();
  });

  it('无错误记录时按钮禁用并给出引导文案', () => {
    const { view, onDrillKeys } = setup({ keyStats: {}, wordStats: {}, sessions: [] });
    view.refresh();
    const btn = document.getElementById('stats-drill-weak-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(onDrillKeys).not.toHaveBeenCalled();
    expect(document.getElementById('stats-empty-banner')!.style.display).toBe('');
    view.dispose();
  });
});

describe('TrainStatsView 易错词列表', () => {
  it('渲染排行行（释义缺失显示 —），单词复习与批量复习回调正确', () => {
    const { view, onReviewWords } = setup({
      keyStats: {},
      wordStats: {
        w1: makeWordStats({ encounters: 4, correct: 3, wrong: 1 }),
        w2: makeWordStats({ encounters: 6, correct: 1, wrong: 5, mastery: 'reviewing' }),
      },
      sessions: [],
    });
    view.refresh();

    const rows = [...document.querySelectorAll('#stats-words-body tr')];
    expect(rows).toHaveLength(2);
    // w2 错误更多排第一
    expect(rows[0].querySelector('.stats-word-text')!.textContent).toBe('banana');
    expect(rows[0].querySelector('.stats-word-meaning')!.textContent).toBe('—');
    expect(rows[0].querySelector('.mastery-badge')!.textContent).toBe('复习中');
    expect(rows[1].querySelector('.stats-word-meaning')!.textContent).toBe('苹果');

    (rows[1].querySelector('button') as HTMLButtonElement).click();
    expect(onReviewWords).toHaveBeenCalledWith(['w1']);

    const allBtn = document.getElementById('stats-review-words-btn') as HTMLButtonElement;
    expect(allBtn.disabled).toBe(false);
    allBtn.click();
    expect(onReviewWords).toHaveBeenCalledWith(['w2', 'w1']);
    view.dispose();
  });

  it('无易错词时隐藏表格、显示空态并禁用批量复习', () => {
    const { view } = setup({ keyStats: {}, wordStats: {}, sessions: [] });
    view.refresh();
    expect(document.getElementById('stats-words-table-wrap')!.style.display).toBe('none');
    expect(document.getElementById('stats-words-empty')!.style.display).toBe('');
    expect((document.getElementById('stats-review-words-btn') as HTMLButtonElement).disabled).toBe(
      true
    );
    view.dispose();
  });
});

describe('TrainStatsView 最近练习', () => {
  it('倒序展示最近会话：训练显示 WPM、游戏显示分数', () => {
    const training: TrainingSession = {
      type: 'training',
      mode: 'key',
      startedAt: new Date('2026-09-01T10:00:00').getTime(),
      duration: 60_000,
      wpm: 32.4,
      cpm: 160,
      accuracy: 96.5,
      mistakeKeys: {},
    };
    const game: GameSession = {
      type: 'game',
      mode: 'zombie',
      startedAt: new Date('2026-09-02T11:00:00').getTime(),
      duration: 120_000,
      score: 850,
      accuracy: 88,
    };
    const { view } = setup({ keyStats: {}, wordStats: {}, sessions: [training, game] });
    view.refresh();

    const rows = [...document.querySelectorAll('.stats-session-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.session-badge')!.textContent).toBe('僵尸大战');
    expect(rows[0].textContent).toContain('850 分');
    expect(rows[0].textContent).toContain('09-02 11:00');
    expect(rows[1].querySelector('.session-badge')!.textContent).toBe('键位');
    expect(rows[1].textContent).toContain('32 WPM');
    expect(document.getElementById('stats-empty-banner')!.style.display).toBe('none');
    view.dispose();
  });
});

describe('TrainStatsView 生命周期', () => {
  it('refresh 可重复调用且键帽 DOM 不重建（监听器不叠加）', () => {
    const { view, onDrillKeys } = setup({
      keyStats: { KeyA: { correct: 0, wrong: 1 } },
      wordStats: {},
      sessions: [],
    });
    view.refresh();
    const first = cell('KeyA');
    view.refresh();
    expect(cell('KeyA')).toBe(first);
    first.click();
    expect(onDrillKeys).toHaveBeenCalledTimes(1);
    view.dispose();
  });

  it('dispose 后点击键帽与按钮不再触发回调', () => {
    const { view, onDrillKeys, onReviewWords } = setup({
      keyStats: { KeyA: { correct: 0, wrong: 1 } },
      wordStats: { w1: makeWordStats({ wrong: 1 }) },
      sessions: [],
    });
    view.refresh();
    view.dispose();
    cell('KeyA').click();
    (document.getElementById('stats-drill-weak-btn') as HTMLButtonElement).click();
    (document.getElementById('stats-review-words-btn') as HTMLButtonElement).click();
    expect(onDrillKeys).not.toHaveBeenCalled();
    expect(onReviewWords).not.toHaveBeenCalled();
  });
});
