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
