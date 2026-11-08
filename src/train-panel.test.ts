import { describe, it, expect, beforeEach } from 'vitest';
import { TrainPanel } from './train-panel.js';
import type { TypingEngine } from './input.js';
import type { VocabularyBank, WordQueryOptions } from './vocabulary.js';
import type { UserProgress } from './storage.js';
import type { TypingEvent, WordEntry } from './types.js';

/**
 * 构建 TrainPanel 所需的最小 DOM fixture（含 cacheDom 中 requireEl 的全部必需元素）。
 * 刻意不包含 #keyboard-ref canvas：jsdom 未实现 2D 上下文，缺省可让 MiniKeyboardCanvas
 * 走 null 分支安全降级。#panel-train 须带 .active，否则 handleTypingEvent 直接返回。
 */
function mountFixture(): void {
  document.body.innerHTML = `
    <section id="panel-train" class="panel active">
      <div class="train-tabs">
        <button class="train-tab-btn active" data-train-tab="key-drill"></button>
        <button class="train-tab-btn" data-train-tab="word"></button>
        <button class="train-tab-btn" data-train-tab="article"></button>
      </div>
      <div id="train-level-select"><select id="level-selector"></select></div>
      <div id="train-phase-select"><span id="phase-indicator"></span></div>
      <div id="train-word-select" style="display:none">
        <div id="word-category-list"></div>
        <select id="word-difficulty-select">
          <option value="all"></option>
          <option value="easy"></option>
          <option value="medium"></option>
          <option value="hard"></option>
        </select>
      </div>
      <div id="train-article-input" style="display:none">
        <textarea id="article-textarea"></textarea>
        <button id="article-load-btn"></button>
        <select id="article-select"></select>
        <button id="article-random-btn"></button>
        <button id="article-seq-btn"></button>
      </div>
      <span id="train-status-badge"></span>
      <div id="text-target"></div>
      <div id="text-input"></div>
      <span id="stat-wpm"></span><span id="stat-cpm"></span>
      <span id="stat-accuracy"></span><span id="stat-progress"></span>
      <button id="train-start-btn"></button>
      <button id="train-reset-btn"></button>
      <button id="train-next-btn" style="display:none"></button>
      <div id="mini-hands-diagram"></div>
      <div id="mini-finger-hint"></div>
      <div id="train-result-modal" style="display:none">
        <h3></h3>
        <div id="result-stats"></div>
        <div id="result-errors"></div>
        <button id="result-close-btn"></button>
      </div>
    </section>
  `;
}

/** 词库桩：单词模式返回固定两词，目标文本恒为 "ab cd"，便于断言 */
function makeVocabStub(): VocabularyBank {
  const words: WordEntry[] = [
    { id: 'w1', text: 'ab', difficulty: 1, category: 'daily' },
    { id: 'w2', text: 'cd', difficulty: 1, category: 'daily' },
  ];
  return {
    getWords: () => words,
    getWordById: (id: string) => words.find((w) => w.id === id),
    getCategories: () => [],
  } as unknown as VocabularyBank;
}

function makeProgressStub(): UserProgress {
  return {
    recordSession: () => {},
    recordKeyResult: () => {},
    recordWordResult: () => {},
  } as unknown as UserProgress;
}

interface Harness {
  feed: (event: TypingEvent) => void;
  targetSpans: () => Element[];
  inputSpans: () => Element[];
  resultErrors: HTMLElement;
}

/** 挂载 TrainPanel，切到单词模式并开始练习，返回驱动输入的句柄 */
function setup(): Harness {
  let callback: ((e: TypingEvent) => void) | null = null;
  const typingStub = {
    on: (cb: (e: TypingEvent) => void) => {
      callback = cb;
      return () => {};
    },
    focus: () => {},
  } as unknown as TypingEngine;

  new TrainPanel({
    typingEngine: typingStub,
    keyboard: null,
    vocabulary: makeVocabStub(),
    progress: makeProgressStub(),
    currentUser: () => 'Tester',
  });

  // 切换到单词模式（触发 preparePreview 生成 "ab cd"），再开始练习
  (document.querySelector('[data-train-tab="word"]') as HTMLElement).click();
  (document.getElementById('train-start-btn') as HTMLElement).click();

  return {
    feed: (event) => callback?.(event),
    targetSpans: () => [...document.querySelectorAll('#text-target .char')],
    // 排除末尾光标 span（class 为 cursor，不含 char）
    inputSpans: () => [...document.querySelectorAll('#text-input .char')],
    resultErrors: document.getElementById('result-errors') as HTMLElement,
  };
}

const char = (c: string): TypingEvent => ({ type: 'char', char: c });

describe('TrainPanel 错误输入反馈渲染', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  it('错误位：标准文本行标红（.error）且仍显示正确字符，输入行红底回显真实敲入字符', () => {
    const h = setup();
    h.feed(char('a')); // 正确
    h.feed(char('x')); // 错误，应为 b

    const target = h.targetSpans();
    const input = h.inputSpans();

    expect(target[1].classList.contains('error')).toBe(true);
    expect(target[1].textContent).toBe('b'); // 顶行始终是标准（正确）字符
    expect(target[0].classList.contains('error')).toBe(false); // 正确位不标红

    expect(input[1].classList.contains('incorrect')).toBe(true);
    expect(input[1].textContent).toBe('x'); // 底行回显用户真实敲入的字符
    expect(input[0].classList.contains('correct')).toBe(true);
  });

  it('错误空格渲染为可见符号 ␣（红底药丸内空白不可辨）', () => {
    const h = setup();
    h.feed(char(' ')); // 首位应为 a，却敲了空格

    const input = h.inputSpans();
    expect(input[0].classList.contains('incorrect')).toBe(true);
    expect(input[0].textContent).toBe('␣');
  });

  it('错误瞬间对输入 span 施加一次性 shake 动画类', () => {
    const h = setup();
    h.feed(char('a'));
    h.feed(char('x')); // 错误 -> 该位应带 shake

    const input = h.inputSpans();
    expect(input[1].classList.contains('shake')).toBe(true);
    expect(input[0].classList.contains('shake')).toBe(false);
  });

  it('结果弹窗错误明细以「应为 Y，你敲了 X」配对呈现', () => {
    const h = setup();
    // 目标 "ab cd"：a 正确、x 错（应为 b）、空格正确、c 正确、d 正确 -> 完成
    h.feed(char('a'));
    h.feed(char('x'));
    h.feed(char(' '));
    h.feed(char('c'));
    h.feed(char('d'));

    const exp = h.resultErrors.querySelector('.err-exp');
    const act = h.resultErrors.querySelector('.err-act');
    expect(exp?.textContent).toBe('b');
    expect(act?.textContent).toBe('x');
    expect(h.resultErrors.textContent).toContain('应为');
    expect(h.resultErrors.textContent).toContain('你敲了');
  });
});

/** 记录 getWords 查询参数的词库桩，用于断言分类/难度过滤生效 */
function makeRecordingVocabStub(): { bank: VocabularyBank; calls: WordQueryOptions[] } {
  const calls: WordQueryOptions[] = [];
  const words: WordEntry[] = [
    { id: 'daily-001', text: 'apple', difficulty: 1, category: 'daily' },
    { id: 'cet4-0001', text: 'abandon', difficulty: 3, category: 'cet4' },
  ];
  const bank = {
    getWords: (options: WordQueryOptions = {}) => {
      calls.push(options);
      return words;
    },
    getWordById: (id: string) => words.find((w) => w.id === id),
    getCategories: () => [
      { id: 'daily', name: '日常英语', language: 'en' },
      { id: 'cet4', name: '大学英语四级', language: 'en' },
    ],
  } as unknown as VocabularyBank;
  return { bank, calls };
}

describe('TrainPanel 单词练习词库选择', () => {
  beforeEach(() => {
    localStorage.clear();
    mountFixture();
  });

  function mountWithRecordingVocab(): { calls: WordQueryOptions[] } {
    const { bank, calls } = makeRecordingVocabStub();
    const typingStub = {
      on: () => () => {},
      focus: () => {},
    } as unknown as TypingEngine;
    new TrainPanel({
      typingEngine: typingStub,
      keyboard: null,
      vocabulary: bank,
      progress: makeProgressStub(),
      currentUser: () => 'Tester',
    });
    return { calls };
  }

  const wordTab = () => document.querySelector('[data-train-tab="word"]') as HTMLElement;
  const categoryBoxes = () =>
    [
      ...document.querySelectorAll('#word-category-list input[type="checkbox"]'),
    ] as HTMLInputElement[];

  it('单词模式下显示词库选择并按分类渲染勾选框（默认全选）', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const wrap = document.getElementById('train-word-select') as HTMLElement;
    expect(wrap.style.display).not.toBe('none');
    expect(categoryBoxes().length).toBe(2);
    expect(categoryBoxes().every((b) => b.checked)).toBe(true);
    // 默认全选 -> 取词查询带上全部分类
    expect(calls[calls.length - 1].categories).toEqual(['daily', 'cet4']);
  });

  it('取消勾选某分类后以剩余分类重新取词并持久化', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const daily = categoryBoxes().find((b) => b.value === 'daily') as HTMLInputElement;
    daily.click(); // 取消勾选 -> 触发 change

    expect(calls[calls.length - 1].categories).toEqual(['cet4']);
    const saved = JSON.parse(localStorage.getItem('typeprime_word_practice_pref') ?? '{}');
    expect(saved.categories).toEqual(['cet4']);
  });

  it('切换难度范围后以对应 difficulties 重新取词', () => {
    const { calls } = mountWithRecordingVocab();
    wordTab().click();

    const sel = document.getElementById('word-difficulty-select') as HTMLSelectElement;
    sel.value = 'hard';
    sel.dispatchEvent(new Event('change'));

    expect(calls[calls.length - 1].difficulties).toEqual([4, 5]);
  });
});
