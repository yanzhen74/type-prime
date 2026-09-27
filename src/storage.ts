import type {
  User,
  UserProgressData,
  KeyStats,
  WordStats,
  TrainingSession,
  GameSession,
  MasteryLevel,
} from './types.js';

const STORAGE_KEY = 'typeprime_users';

export class UserProgress {
  private users: UserProgressData[];
  private currentUserId: string;

  constructor() {
    this.users = this.load();
    this.currentUserId = this.users[0]?.id ?? '';
  }

  private load(): UserProgressData[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as User[] | UserProgressData[];
        if (Array.isArray(parsed)) {
          return parsed.map((user) => this.migrate(user));
        }
      }
    } catch {
      // ignore
    }
    return this.createDefaultUsers();
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.users));
  }

  private migrate(user: User | UserProgressData): UserProgressData {
    const progress = user as Partial<UserProgressData>;
    return {
      id: user.id,
      name: user.name,
      highScore: user.highScore,
      totalGames: user.totalGames,
      keyStats: progress.keyStats ?? {},
      wordStats: progress.wordStats ?? {},
      sessions: progress.sessions ?? [],
    };
  }

  private createDefaultUsers(): UserProgressData[] {
    const defaults: UserProgressData[] = [
      {
        id: 'u1',
        name: '玩家 1',
        highScore: 0,
        totalGames: 0,
        keyStats: {},
        wordStats: {},
        sessions: [],
      },
      {
        id: 'u2',
        name: '玩家 2',
        highScore: 0,
        totalGames: 0,
        keyStats: {},
        wordStats: {},
        sessions: [],
      },
      {
        id: 'u3',
        name: '玩家 3',
        highScore: 0,
        totalGames: 0,
        keyStats: {},
        wordStats: {},
        sessions: [],
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  getUsers(): UserProgressData[] {
    return this.users;
  }

  getCurrentUser(): UserProgressData | undefined {
    return this.users.find((u) => u.id === this.currentUserId);
  }

  setCurrentUser(id: string): void {
    if (this.users.some((u) => u.id === id)) {
      this.currentUserId = id;
    }
  }

  addUser(name: string): UserProgressData {
    const id = `u${Date.now()}`;
    const user: UserProgressData = {
      id,
      name,
      highScore: 0,
      totalGames: 0,
      keyStats: {},
      wordStats: {},
      sessions: [],
    };
    this.users.push(user);
    this.save();
    return user;
  }

  updateScore(score: number): void {
    const user = this.getCurrentUser();
    if (!user) return;
    user.totalGames += 1;
    if (score > user.highScore) {
      user.highScore = score;
    }
    this.save();
  }

  recordKeyResult(code: string, isCorrect: boolean): void {
    const user = this.getCurrentUser();
    if (!user) return;

    const stats = user.keyStats[code] ?? { correct: 0, wrong: 0 };
    if (isCorrect) {
      stats.correct += 1;
    } else {
      stats.wrong += 1;
    }
    user.keyStats[code] = stats;
    this.save();
  }

  recordWordResult(wordId: string, isCorrect: boolean): void {
    const user = this.getCurrentUser();
    if (!user) return;

    const stats = user.wordStats[wordId] ?? this.createEmptyWordStats();
    stats.encounters += 1;
    if (isCorrect) {
      stats.correct += 1;
    } else {
      stats.wrong += 1;
    }
    stats.lastReview = Date.now();
    stats.mastery = this.calculateMastery(stats);
    user.wordStats[wordId] = stats;
    this.save();
  }

  recordSession(session: TrainingSession | GameSession): void {
    const user = this.getCurrentUser();
    if (!user) return;
    user.sessions.push(session);
    this.save();
  }

  getKeyStats(code?: string): Record<string, KeyStats> | KeyStats | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    if (code) {
      return user.keyStats[code];
    }
    return user.keyStats;
  }

  getWordStats(wordId?: string): Record<string, WordStats> | WordStats | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    if (wordId) {
      return user.wordStats[wordId];
    }
    return user.wordStats;
  }

  private createEmptyWordStats(): WordStats {
    return {
      encounters: 0,
      correct: 0,
      wrong: 0,
      lastReview: 0,
      nextReview: 0,
      mastery: 'new',
    };
  }

  private calculateMastery(stats: WordStats): MasteryLevel {
    if (stats.correct >= 5 && stats.wrong <= 1) return 'mastered';
    if (stats.correct >= 2) return 'reviewing';
    if (stats.encounters > 0) return 'learning';
    return 'new';
  }
}
