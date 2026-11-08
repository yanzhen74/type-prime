import type { Difficulty, MasteryLevel, WordEntry, WordStats } from './types.js';
import type { VocabularyBank } from './vocabulary.js';
import type { ReviewScheduler } from './review.js';
import type { UserProgress } from './storage.js';

/**
 * 词库管理面板协调器。
 *
 * 负责「词库」面板（#panel-vocab）的 DOM 渲染与交互：
 * - 分类筛选、搜索、单词列表（含掌握度徽章与下次复习时间）
 * - 单词的添加 / 编辑 / 删除
 * - 词库 JSON 导入 / 导出
 * - 「今日复习」入口：取 ReviewScheduler 到期队列并交给训练面板开始复习练习
 *
 * 与 TrainPanel 一致，本类通过 deps 注入消费 VocabularyBank / ReviewScheduler /
 * UserProgress，main.ts 仅作为协调者，不直接操作面板 DOM。
 */
export interface VocabPanelDeps {
  /** 词库（单词与分类的增删改查、导入导出） */
  vocabulary: VocabularyBank;
  /** 记忆曲线复习调度（到期队列、下次复习时间） */
  review: ReviewScheduler;
  /** 用户进度（读取每个单词的掌握度统计） */
  progress: UserProgress;
  /** 点击「今日复习」时回调，由 main.ts 切换到训练面板并开始复习练习 */
  onStartReview: (wordIds: string[]) => void;
}

/** 掌握度等级 -> 中文标签 */
const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: '未学',
  learning: '学习中',
  reviewing: '复习中',
  mastered: '已掌握',
};

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`VocabPanel: 未找到必需的 DOM 元素 #${id}`);
  }
  return el as T;
}

/** 时间戳格式化为 YYYY-MM-DD；0 或无效值返回破折号 */
function formatDate(ts: number): string {
  if (!ts || Number.isNaN(ts)) {
    return '—';
  }
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class VocabPanel {
  private readonly deps: VocabPanelDeps;
  /** 当前处于编辑状态的单词 ID；null 表示表单用于新增 */
  private editingId: string | null = null;

  // DOM 引用
  private readonly categoryFilter: HTMLSelectElement;
  private readonly searchInput: HTMLInputElement;
  private readonly wordListBody: HTMLElement;
  private readonly totalCountEl: HTMLElement;
  private readonly reviewBtn: HTMLButtonElement;
  private readonly reviewCountEl: HTMLElement;
  private readonly wordTextInput: HTMLInputElement;
  private readonly meaningInput: HTMLInputElement;
  private readonly categorySelect: HTMLSelectElement;
  private readonly difficultySelect: HTMLSelectElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly exportBtn: HTMLButtonElement;
  private readonly importBtn: HTMLButtonElement;
  private readonly importFile: HTMLInputElement;

  constructor(deps: VocabPanelDeps) {
    this.deps = deps;

    this.categoryFilter = requireEl<HTMLSelectElement>('vocab-category-filter');
    this.searchInput = requireEl<HTMLInputElement>('vocab-search');
    this.wordListBody = requireEl<HTMLElement>('vocab-word-list');
    this.totalCountEl = requireEl<HTMLElement>('vocab-total-count');
    this.reviewBtn = requireEl<HTMLButtonElement>('vocab-review-btn');
    this.reviewCountEl = requireEl<HTMLElement>('vocab-review-count');
    this.wordTextInput = requireEl<HTMLInputElement>('vocab-word-text');
    this.meaningInput = requireEl<HTMLInputElement>('vocab-word-meaning');
    this.categorySelect = requireEl<HTMLSelectElement>('vocab-word-category');
    this.difficultySelect = requireEl<HTMLSelectElement>('vocab-word-difficulty');
    this.submitBtn = requireEl<HTMLButtonElement>('vocab-submit-btn');
    this.cancelBtn = requireEl<HTMLButtonElement>('vocab-cancel-btn');
    this.exportBtn = requireEl<HTMLButtonElement>('vocab-export-btn');
    this.importBtn = requireEl<HTMLButtonElement>('vocab-import-btn');
    this.importFile = requireEl<HTMLInputElement>('vocab-import-file');

    this.initDifficultyOptions();
    this.bindEvents();
    this.refresh();
  }

  /** 面板激活、用户切换或词库变动后调用，重建分类下拉与列表 */
  refresh(): void {
    this.populateCategories();
    this.render();
  }

  // -------------------------------------------------------------------------
  // 初始化与事件
  // -------------------------------------------------------------------------

  private initDifficultyOptions(): void {
    this.difficultySelect.innerHTML = '';
    for (const d of DIFFICULTIES) {
      const option = document.createElement('option');
      option.value = String(d);
      option.textContent = `难度 ${d}`;
      this.difficultySelect.appendChild(option);
    }
    this.difficultySelect.value = '1';
  }

  private bindEvents(): void {
    this.categoryFilter.addEventListener('change', () => this.render());
    this.searchInput.addEventListener('input', () => this.render());
    this.reviewBtn.addEventListener('click', () => this.handleReview());
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    this.cancelBtn.addEventListener('click', () => this.resetForm());
    this.exportBtn.addEventListener('click', () => this.handleExport());
    this.importBtn.addEventListener('click', () => this.importFile.click());
    this.importFile.addEventListener('change', () => this.handleImport());
    this.wordListBody.addEventListener('click', (e) => this.handleListClick(e));
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  private populateCategories(): void {
    const categories = this.deps.vocabulary.getCategories();

    // 筛选下拉：保留「全部分类」+ 各分类，维持当前选择
    const currentFilter = this.categoryFilter.value;
    this.categoryFilter.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = '全部分类';
    this.categoryFilter.appendChild(allOption);
    for (const c of categories) {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.name;
      this.categoryFilter.appendChild(option);
    }
    this.categoryFilter.value = currentFilter || '';

    // 表单分类下拉：维持当前选择（编辑时不被覆盖）
    const currentForm = this.categorySelect.value;
    this.categorySelect.innerHTML = '';
    for (const c of categories) {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.name;
      this.categorySelect.appendChild(option);
    }
    if (currentForm && categories.some((c) => c.id === currentForm)) {
      this.categorySelect.value = currentForm;
    }
  }

  private render(): void {
    const words = this.filteredWords();
    const categoryNames = this.categoryNameMap();

    this.wordListBody.innerHTML = '';
    if (words.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" class="vocab-empty">没有匹配的单词</td>';
      this.wordListBody.appendChild(tr);
    } else {
      for (const word of words) {
        this.wordListBody.appendChild(this.createRow(word, categoryNames));
      }
    }

    const total = this.deps.vocabulary.getWords().length;
    this.totalCountEl.textContent = `${words.length} / ${total}`;

    const dueCount = this.dueWordIds().length;
    this.reviewCountEl.textContent = String(dueCount);
    this.reviewBtn.disabled = dueCount === 0;
  }

  private createRow(word: WordEntry, categoryNames: Map<string, string>): HTMLElement {
    const tr = document.createElement('tr');
    tr.dataset.id = word.id;

    const mastery = this.masteryOf(word.id);
    const dueDate = this.deps.review.getState(word.id)?.dueDate ?? 0;

    tr.innerHTML = [
      `<td class="vocab-word-text">${escapeHtml(word.text)}</td>`,
      `<td>${escapeHtml(word.meaning ?? '—')}</td>`,
      `<td>${escapeHtml(categoryNames.get(word.category) ?? word.category)}</td>`,
      `<td class="vocab-difficulty">${word.difficulty}</td>`,
      `<td><span class="mastery-badge mastery-${mastery}">${MASTERY_LABELS[mastery]}</span></td>`,
      `<td>${formatDate(dueDate)}</td>`,
      `<td class="vocab-row-actions">` +
        `<button class="btn-small" data-action="edit">编辑</button>` +
        `<button class="btn-small btn-danger" data-action="delete">删除</button>` +
        `</td>`,
    ].join('');
    return tr;
  }

  /** 按分类筛选与搜索词过滤后的单词，按分类/难度/文本稳定排序 */
  private filteredWords(): WordEntry[] {
    const category = this.categoryFilter.value;
    const keyword = this.searchInput.value.trim().toLowerCase();

    let words = this.deps.vocabulary.getWords();
    if (category) {
      words = words.filter((w) => w.category === category);
    }
    if (keyword) {
      words = words.filter(
        (w) =>
          w.text.toLowerCase().includes(keyword) ||
          (w.meaning ?? '').toLowerCase().includes(keyword)
      );
    }
    return words.sort((a, b) => {
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
    });
  }

  private categoryNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const c of this.deps.vocabulary.getCategories()) {
      map.set(c.id, c.name);
    }
    return map;
  }

  private masteryOf(wordId: string): MasteryLevel {
    const stats = this.deps.progress.getWordStats(wordId) as WordStats | undefined;
    return stats?.mastery ?? 'new';
  }

  /** 到期复习且在词库中仍然存在的单词 ID 列表 */
  private dueWordIds(): string[] {
    return this.deps.review
      .getDueReviews()
      .filter((id) => this.deps.vocabulary.getWordById(id) !== undefined);
  }

  // -------------------------------------------------------------------------
  // 交互处理
  // -------------------------------------------------------------------------

  private handleReview(): void {
    const ids = this.dueWordIds();
    if (ids.length === 0) {
      window.alert('今日没有需要复习的单词。');
      return;
    }
    this.deps.onStartReview(ids);
  }

  private handleSubmit(): void {
    const text = this.wordTextInput.value.trim();
    const meaning = this.meaningInput.value.trim();
    const category = this.categorySelect.value;
    const difficulty = Number(this.difficultySelect.value) as Difficulty;

    if (!text) {
      window.alert('单词内容不能为空。');
      return;
    }
    if (!category) {
      window.alert('请选择单词分类。');
      return;
    }

    try {
      if (this.editingId) {
        const updated: WordEntry = {
          id: this.editingId,
          text,
          difficulty,
          category,
          meaning: meaning || undefined,
        };
        this.deps.vocabulary.updateWord(updated);
      } else {
        this.deps.vocabulary.addWord({
          text,
          difficulty,
          category,
          meaning: meaning || undefined,
        });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存单词失败。');
      return;
    }

    this.resetForm();
    this.render();
  }

  private handleListClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    const button = target?.closest('button[data-action]') as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const row = button.closest('tr[data-id]') as HTMLElement | null;
    const id = row?.dataset.id;
    if (!id) {
      return;
    }
    const action = button.getAttribute('data-action');
    if (action === 'edit') {
      this.beginEdit(id);
    } else if (action === 'delete') {
      this.handleDelete(id);
    }
  }

  private beginEdit(id: string): void {
    const word = this.deps.vocabulary.getWordById(id);
    if (!word) {
      return;
    }
    this.editingId = id;
    this.wordTextInput.value = word.text;
    this.meaningInput.value = word.meaning ?? '';
    this.categorySelect.value = word.category;
    this.difficultySelect.value = String(word.difficulty);
    this.submitBtn.textContent = '保存修改';
    this.cancelBtn.style.display = '';
    this.wordTextInput.focus();
  }

  private handleDelete(id: string): void {
    const word = this.deps.vocabulary.getWordById(id);
    const label = word ? word.text : id;
    if (!window.confirm(`确定删除单词「${label}」吗？`)) {
      return;
    }
    this.deps.vocabulary.removeWord(id);
    if (this.editingId === id) {
      this.resetForm();
    }
    this.render();
  }

  private resetForm(): void {
    this.editingId = null;
    this.wordTextInput.value = '';
    this.meaningInput.value = '';
    this.difficultySelect.value = '1';
    this.submitBtn.textContent = '添加单词';
    this.cancelBtn.style.display = 'none';
  }

  private handleExport(): void {
    const data = this.deps.vocabulary.exportJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `type-prime-vocab-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private handleImport(): void {
    const file = this.importFile.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = this.deps.vocabulary.importJSON(parsed);
        window.alert(`导入完成：新增 ${result.added} 个，更新 ${result.updated} 个。`);
        this.refresh();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '导入失败：文件不是合法的词库 JSON。');
      } finally {
        this.importFile.value = '';
      }
    };
    reader.onerror = () => {
      window.alert('读取文件失败。');
      this.importFile.value = '';
    };
    reader.readAsText(file);
  }
}
