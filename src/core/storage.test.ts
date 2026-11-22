import { describe, it, expect, beforeEach } from 'vitest';
import { UserProgress } from './storage.js';

describe('UserProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates default users on first load', () => {
    const storage = new UserProgress();
    const users = storage.getUsers();
    expect(users).toHaveLength(3);
    expect(users[0].name).toBe('玩家 1');
  });

  it('adds a new user', () => {
    const storage = new UserProgress();
    const user = storage.addUser('测试用户');
    expect(user.name).toBe('测试用户');
    expect(storage.getUsers()).toHaveLength(4);
  });

  it('updates high score for current user', () => {
    const storage = new UserProgress();
    storage.updateScore(150);
    const user = storage.getCurrentUser();
    expect(user?.highScore).toBe(150);
    expect(user?.totalGames).toBe(1);
  });

  it('persists data to localStorage', () => {
    const storage = new UserProgress();
    storage.addUser('持久化用户');
    const saved = localStorage.getItem('typeprime_users');
    expect(saved).toContain('持久化用户');
  });

  it('records key statistics', () => {
    const storage = new UserProgress();
    storage.recordKeyResult('KeyA', true);
    storage.recordKeyResult('KeyA', false);
    const stats = storage.getKeyStats('KeyA') as { correct: number; wrong: number };
    expect(stats.correct).toBe(1);
    expect(stats.wrong).toBe(1);
  });

  it('records word statistics', () => {
    const storage = new UserProgress();
    storage.recordWordResult('w1', true);
    storage.recordWordResult('w1', true);
    const stats = storage.getWordStats('w1') as { correct: number; mastery: string };
    expect(stats.correct).toBe(2);
    expect(stats.mastery).toBe('reviewing');
  });

  it('records sessions', () => {
    const storage = new UserProgress();
    const session = {
      type: 'training' as const,
      mode: 'article' as const,
      startedAt: Date.now(),
      duration: 60000,
      wpm: 60,
      cpm: 300,
      accuracy: 95,
      mistakeKeys: {},
    };
    storage.recordSession(session);
    const user = storage.getCurrentUser();
    expect(user?.sessions).toHaveLength(1);
  });

  it('key drill progress is per-user and persisted', () => {
    const storage = new UserProgress();
    storage.setKeyDrillProgress({ levelId: 'top-row', phases: { 'top-row': 2 } });
    expect(storage.getKeyDrillProgress()).toEqual({ levelId: 'top-row', phases: { 'top-row': 2 } });
    // 重建实例（模拟刷新）后仍在；切换到其他用户则互不串扰
    const reloaded = new UserProgress();
    expect(reloaded.getKeyDrillProgress().levelId).toBe('top-row');
    const users = reloaded.getUsers();
    reloaded.setCurrentUser(users[1].id);
    expect(reloaded.getKeyDrillProgress()).toEqual({});
    reloaded.setKeyDrillProgress({ levelId: 'home-row', phases: { 'home-row': 1 } });
    reloaded.setCurrentUser(users[0].id);
    expect(reloaded.getKeyDrillProgress().levelId).toBe('top-row');
  });

  it('migrates legacy users without keyDrill field', () => {
    localStorage.setItem(
      'typeprime_users',
      JSON.stringify([{ id: 'u1', name: '旧用户', highScore: 0, totalGames: 0 }])
    );
    const storage = new UserProgress();
    expect(storage.getKeyDrillProgress()).toEqual({});
    storage.setKeyDrillProgress({ phases: { 'home-row': 1 } });
    expect(storage.getKeyDrillProgress().phases).toEqual({ 'home-row': 1 });
  });
});
