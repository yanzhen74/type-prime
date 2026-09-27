import { describe, it, expect, beforeEach } from 'vitest';
import { UserStorage } from './storage.js';

describe('UserStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates default users on first load', () => {
    const storage = new UserStorage();
    const users = storage.getUsers();
    expect(users).toHaveLength(3);
    expect(users[0].name).toBe('玩家 1');
  });

  it('adds a new user', () => {
    const storage = new UserStorage();
    const user = storage.addUser('测试用户');
    expect(user.name).toBe('测试用户');
    expect(storage.getUsers()).toHaveLength(4);
  });

  it('updates high score for current user', () => {
    const storage = new UserStorage();
    storage.updateScore(150);
    const user = storage.getCurrentUser();
    expect(user?.highScore).toBe(150);
    expect(user?.totalGames).toBe(1);
  });

  it('persists data to localStorage', () => {
    const storage = new UserStorage();
    storage.addUser('持久化用户');
    const saved = localStorage.getItem('typeprime_users');
    expect(saved).toContain('持久化用户');
  });
});
