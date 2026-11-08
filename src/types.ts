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
  /** 最近一次错误输入（字符 + 时间戳），用于短时红色闪烁/shake 反馈；超时后不再渲染 */
  lastError?: { char: string; at: number };
  /** 本关已销毁单词数（达成通关目标即升关） */
  wordsClearedThisLevel?: number;
  /** 累计已通关关数 */
  levelsCleared?: number;
  /** 是否已通关成功（胜利） */
  victory?: boolean;
  /** 最近一次升关时间戳，用于短时「通关」横幅 */
  levelClearFlashAt?: number;
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
  /**
   * 父分类 id，用于构建「版本 → 册 → 课」层级树。
   * 顶层分类留空；当前仅预留结构，暂不填充课本层级数据。
   */
  parent?: string;
  /**
   * 课本层级元信息（版本/年级册次/课次），为未来「版本→册→课」级联选择预留。
   * 当前不填充数据，避免日后调整数据模型。
   */
  meta?: { version?: string; grade?: string; lesson?: string };
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

/** 练习层级定义 */
export interface TrainingLevel {
  id: string;
  name: string;
  keys: string[]; // 该层级涉及的键位（小写字母或符号字符）
  description: string;
}

/** 练习模式 */
export type PracticeMode = 'key-drill' | 'word' | 'article';

/**
 * 键位练习阶段（由浅入深递进）。
 *
 * - `single-repeat`：单键重复，先建立键位与手指的对应关系
 * - `pair-combo`：相邻双键组合，练习手指之间的切换
 * - `random-mix`：随机混合，综合巩固
 */
export type DrillPhase = 'single-repeat' | 'pair-combo' | 'random-mix';

/** 逐字符比对结果 */
export interface CharResult {
  expected: string;
  actual: string | null; // null = 尚未输入
  correct: boolean | null; // null = 尚未输入
  timestamp?: number;
}

/** 练习进度事件 */
export interface TrainProgress {
  total: number;
  completed: number;
  correct: number;
  wpm: number;
  cpm: number;
  errors: CharResult[];
}
