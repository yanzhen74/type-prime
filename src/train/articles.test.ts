import { describe, it, expect } from 'vitest';
import {
  ARTICLE_DIFFICULTIES,
  PRESET_ARTICLES,
  getArticleDifficulty,
  getPresetArticle,
  nextPresetArticle,
  randomPresetArticle,
} from './articles.js';

describe('预装文章库', () => {
  it('文章库非空，且每篇文章字段完整', () => {
    expect(PRESET_ARTICLES.length).toBeGreaterThan(0);
    for (const article of PRESET_ARTICLES) {
      expect(article.id).toBeTruthy();
      expect(article.title).toBeTruthy();
      expect(article.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('文章 id 唯一', () => {
    const ids = PRESET_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每篇文章的 difficultyId 均存在于难度分级中', () => {
    const validIds = new Set(ARTICLE_DIFFICULTIES.map((d) => d.id));
    for (const article of PRESET_ARTICLES) {
      expect(validIds.has(article.difficultyId)).toBe(true);
    }
  });

  it('文章按难度由浅入深排列（难度序号非递减）', () => {
    const rank = new Map(ARTICLE_DIFFICULTIES.map((d, i) => [d.id, i]));
    let prev = -1;
    for (const article of PRESET_ARTICLES) {
      const r = rank.get(article.difficultyId)!;
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('getPresetArticle / getArticleDifficulty 按 id 查找', () => {
    const first = PRESET_ARTICLES[0];
    expect(getPresetArticle(first.id)).toBe(first);
    expect(getPresetArticle('不存在')).toBeUndefined();
    expect(getArticleDifficulty(first.difficultyId)?.id).toBe(first.difficultyId);
    expect(getArticleDifficulty('不存在')).toBeUndefined();
  });

  it('nextPresetArticle(-1) 返回第一篇', () => {
    expect(nextPresetArticle(-1)).toBe(PRESET_ARTICLES[0]);
  });

  it('nextPresetArticle 顺序推进，末尾默认回到开头', () => {
    const last = PRESET_ARTICLES.length - 1;
    expect(nextPresetArticle(0)).toBe(PRESET_ARTICLES[1]);
    expect(nextPresetArticle(last)).toBe(PRESET_ARTICLES[0]);
    expect(nextPresetArticle(last, false)).toBeNull();
  });

  it('randomPresetArticle 返回库内文章，且可避开指定 id', () => {
    const picked = randomPresetArticle();
    expect(picked).not.toBeNull();
    expect(PRESET_ARTICLES).toContain(picked!);

    // 多次抽取，验证 excludeId 时不会返回被排除的文章（除非库仅一篇）
    if (PRESET_ARTICLES.length > 1) {
      const excludeId = PRESET_ARTICLES[0].id;
      for (let i = 0; i < 30; i++) {
        expect(randomPresetArticle(excludeId)!.id).not.toBe(excludeId);
      }
    }
  });
});
