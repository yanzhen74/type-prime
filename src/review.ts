import type { ReviewState } from './types.js';

const STORAGE_KEY = 'typeprime_reviews';
const DATA_VERSION = 1;

interface ReviewData {
  version: number;
  states: Record<string, ReviewState>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 基于 SM-2 间隔重复算法的复习调度模块。
 *
 * 根据用户对单词的回答结果（正确 / 错误）动态调整下次复习时间，
 * 并提供“今日到期复习队列”。
 */
export class ReviewScheduler {
  private states: Map<string, ReviewState>;

  constructor() {
    this.states = this.load();
  }

  /**
   * 记录一次单词复习结果。
   * @param wordId 单词 ID
   * @param isCorrect 是否正确
   * @param now 当前时间戳（ms），默认 Date.now()
   */
  recordResult(wordId: string, isCorrect: boolean, now: number = Date.now()): ReviewState {
    const previous = this.states.get(wordId);
    const state = this.nextState(previous, isCorrect, now);
    this.states.set(wordId, state);
    this.persist();
    return state;
  }

  /**
   * 获取到期的复习单词 ID 列表，按到期时间升序排列。
   */
  getDueReviews(now: number = Date.now()): string[] {
    const due: { wordId: string; dueDate: number }[] = [];
    for (const [wordId, state] of this.states) {
      if (state.dueDate <= now) {
        due.push({ wordId, dueDate: state.dueDate });
      }
    }
    due.sort((a, b) => a.dueDate - b.dueDate);
    return due.map((item) => item.wordId);
  }

  getState(wordId: string): ReviewState | undefined {
    return this.states.get(wordId);
  }

  exportJSON(): ReviewData {
    const states: Record<string, ReviewState> = {};
    for (const [wordId, state] of this.states) {
      states[wordId] = state;
    }
    return { version: DATA_VERSION, states };
  }

  importJSON(data: Partial<ReviewData>): void {
    const rawStates = data.states ?? {};
    this.states = new Map(Object.entries(rawStates));
    this.persist();
  }

  private nextState(
    previous: ReviewState | undefined,
    isCorrect: boolean,
    now: number
  ): ReviewState {
    const q = isCorrect ? 4 : 1;
    const ef = previous ? previous.easeFactor : 2.5;
    const newEf = Math.max(1.3, ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

    if (q < 3) {
      return {
        wordId: previous?.wordId ?? '',
        interval: 1,
        repetition: 0,
        easeFactor: newEf,
        dueDate: now + DAY_MS,
        lastReviewed: now,
      };
    }

    const repetition = (previous?.repetition ?? 0) + 1;
    let interval: number;
    if (repetition === 1) {
      interval = 1;
    } else if (repetition === 2) {
      interval = 6;
    } else {
      interval = (previous?.interval ?? 1) * ef;
    }

    return {
      wordId: previous?.wordId ?? '',
      interval,
      repetition,
      easeFactor: newEf,
      dueDate: now + interval * DAY_MS,
      lastReviewed: now,
    };
  }

  private load(): Map<string, ReviewState> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ReviewData;
        if (parsed.version === DATA_VERSION) {
          return new Map(Object.entries(parsed.states));
        }
      }
    } catch {
      // ignore
    }
    return new Map();
  }

  private persist(): void {
    const data: ReviewData = {
      version: DATA_VERSION,
      states: Object.fromEntries(this.states),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
