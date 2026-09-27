import type { User } from './types.js';

const STORAGE_KEY = 'typeprime_users';

export class UserStorage {
  private users: User[];
  private currentUserId: string;

  constructor() {
    this.users = this.load();
    this.currentUserId = this.users[0]?.id ?? '';
  }

  private load(): User[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as User[];
      }
    } catch {
      // ignore
    }
    return this.createDefaultUsers();
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.users));
  }

  private createDefaultUsers(): User[] {
    const defaults: User[] = [
      { id: 'u1', name: '玩家 1', highScore: 0, totalGames: 0 },
      { id: 'u2', name: '玩家 2', highScore: 0, totalGames: 0 },
      { id: 'u3', name: '玩家 3', highScore: 0, totalGames: 0 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  getUsers(): User[] {
    return this.users;
  }

  getCurrentUser(): User | undefined {
    return this.users.find((u) => u.id === this.currentUserId);
  }

  setCurrentUser(id: string): void {
    if (this.users.some((u) => u.id === id)) {
      this.currentUserId = id;
    }
  }

  addUser(name: string): User {
    const id = `u${Date.now()}`;
    const user: User = { id, name, highScore: 0, totalGames: 0 };
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
}
