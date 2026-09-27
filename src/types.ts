export interface User {
  id: string;
  name: string;
  highScore: number;
  totalGames: number;
}

export interface Word {
  text: string;
  x: number;
  y: number;
  speed: number;
  typedIndex: number;
}

export interface GameState {
  score: number;
  lives: number;
  level: number;
  isRunning: boolean;
  isPaused: boolean;
  words: Word[];
  currentInput: string;
  lockedWordIndex: number | null;
  mistakes: number;
  countdown: number;
}

export type Finger = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb' | 'unknown';

// 词库与记忆曲线相关类型
export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type MasteryLevel = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface WordEntry {
  id: string;
  text: string;
  difficulty: Difficulty;
  category: string;
  tags?: string[];
  meaning?: string;
  phonetic?: string;
  example?: string;
  pinyin?: string;
}

export interface VocabularyCategory {
  id: string;
  name: string;
  language: string;
  description?: string;
}

export interface ReviewState {
  wordId: string;
  /** 当前间隔，单位：天 */
  interval: number;
  /** 连续正确次数 */
  repetition: number;
  /** SM-2 易度因子 */
  easeFactor: number;
  /** 下次复习时间戳（ms） */
  dueDate: number;
  /** 上次复习时间戳（ms） */
  lastReviewed: number;
}

// 统一输入事件
export type TypingEvent =
  { type: 'char'; char: string } | { type: 'backspace' } | { type: 'submit' } | { type: 'escape' };

// 用户进度统计
export interface KeyStats {
  correct: number;
  wrong: number;
}

export interface WordStats {
  encounters: number;
  correct: number;
  wrong: number;
  lastReview: number;
  nextReview: number;
  mastery: MasteryLevel;
}

export interface TrainingSession {
  type: 'training';
  mode: 'free' | 'key' | 'article';
  startedAt: number;
  duration: number;
  wpm: number;
  cpm: number;
  accuracy: number;
  mistakeKeys: Record<string, number>;
}

export interface GameSession {
  type: 'game';
  mode: 'falling' | 'shooter' | 'zombie';
  startedAt: number;
  duration: number;
  score: number;
  accuracy: number;
  maxCombo?: number;
}

export interface UserProgressData extends User {
  keyStats: Record<string, KeyStats>;
  wordStats: Record<string, WordStats>;
  sessions: (TrainingSession | GameSession)[];
}
