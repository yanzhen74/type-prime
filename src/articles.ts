/**
 * 预装文章库（文章练习用）。
 *
 * 仿照键位练习的 `TRAINING_LEVELS`，将文章按指法难度分级、由浅入深排列：
 * 从「用较少指法、几乎无标点」的短句，逐步过渡到「复杂指法组合、含完整标点与符号」的段落。
 * `PRESET_ARTICLES` 的数组顺序即推荐的顺序练习（由浅入深）次序。
 */

/** 文章难度分级（顺序即由浅入深） */
export interface ArticleDifficulty {
  id: string;
  name: string;
  description: string;
}

/** 单篇预装文章 */
export interface PresetArticle {
  id: string;
  title: string;
  /** 所属难度分级 id */
  difficultyId: string;
  content: string;
  /** 出处/作者（经典名篇均为公有领域作品，标注来源） */
  source?: string;
}

/** 文章难度分级定义（由浅入深） */
export const ARTICLE_DIFFICULTIES: ArticleDifficulty[] = [
  {
    id: 'starter',
    name: '入门',
    description: '短句、小写为主、几乎无标点，聚焦基准键位与常见字母',
  },
  {
    id: 'basic',
    name: '基础',
    description: '简单句、首字母大写、句号与逗号，覆盖常用字母组合',
  },
  {
    id: 'advanced',
    name: '进阶',
    description: '较长段落、大小写混排，含问号感叹号与引号等多种标点',
  },
  {
    id: 'master',
    name: '综合',
    description: '复杂指法组合，含数字、括号、分号、冒号、破折号等全部符号',
  },
];

/**
 * 预装文章（顺序 = 由浅入深）。
 *
 * 每篇标注 `difficultyId`；同一难度内按内容长度与符号复杂度递增排列。
 */
export const PRESET_ARTICLES: PresetArticle[] = [
  // --- 入门 ---
  {
    id: 'starter-home-keys',
    title: '基准键短句',
    difficultyId: 'starter',
    content: 'dad has a salad. a lass asked for salt. all fall fast as a flash.',
  },
  {
    id: 'starter-short-steps',
    title: '短步停顿',
    difficultyId: 'starter',
    content: 'the cat sat. the dog ran. the sun set. all was still and calm.',
  },
  {
    id: 'starter-proverb-tortoise',
    title: '龟兔赛跑・箴言',
    difficultyId: 'starter',
    content: 'slow and steady wins the race.',
    source: '伊索寓言（公有领域）',
  },
  {
    id: 'starter-proverb-bird',
    title: '早起的鸟儿・箴言',
    difficultyId: 'starter',
    content: 'the early bird catches the worm.',
    source: '英语谚语（公有领域）',
  },
  // --- 基础 ---
  {
    id: 'basic-busy-morning',
    title: '忙碌的早晨',
    difficultyId: 'basic',
    content:
      'Tom gets up at seven every morning. He eats bread and eggs, then he walks to school with his friends.',
  },
  {
    id: 'basic-little-garden',
    title: '小花园',
    difficultyId: 'basic',
    content:
      'Anna has a small garden behind her house. She plants roses, tulips, and green beans, and she waters them every day.',
  },
  {
    id: 'basic-hamlet-question',
    title: '生存还是毁灭',
    difficultyId: 'basic',
    content: 'To be, or not to be, that is the question.',
    source: '莎士比亚《哈姆雷特》（公有领域）',
  },
  {
    id: 'basic-proverb-will',
    title: '有志者事竟成・箴言',
    difficultyId: 'basic',
    content: 'Where there is a will, there is a way.',
    source: '英语谚语（公有领域）',
  },
  // --- 进阶 ---
  {
    id: 'advanced-question-of-time',
    title: '时间的疑问',
    difficultyId: 'advanced',
    content:
      "Why do we always rush? 'Slow down,' she said, 'and enjoy the moment!' It wasn't easy, but he tried his best to listen.",
  },
  {
    id: 'advanced-weather-report',
    title: '天气预报',
    difficultyId: 'advanced',
    content:
      'The forecast promised bright sunshine; instead, dark clouds rolled in, and heavy rain poured all afternoon. Who could believe it?',
  },
  {
    id: 'advanced-pride-prejudice',
    title: '傲慢与偏见・开篇',
    difficultyId: 'advanced',
    content:
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    source: '简·奥斯汀《傲慢与偏见》（1813，公有领域）',
  },
  {
    id: 'advanced-tale-two-cities',
    title: '双城记・开篇',
    difficultyId: 'advanced',
    content:
      'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.',
    source: '狄更斯《双城记》（1859，公有领域）',
  },
  {
    id: 'advanced-alice-wonderland',
    title: '爱丽丝梦游仙境・开篇',
    difficultyId: 'advanced',
    content:
      'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
    source: '刘易斯·卡罗尔《爱丽丝梦游仙境》（1865，公有领域）',
  },
  // --- 综合 ---
  {
    id: 'master-mixed-symbols',
    title: '符号混排',
    difficultyId: 'master',
    content:
      'Meet at 3:30 PM (Room 12-B); bring $20.50, a #2 pencil, and 3/4 cup of sugar -- or face 100% failure!',
  },
  {
    id: 'master-code-notes',
    title: '代码笔记',
    difficultyId: 'master',
    content:
      'Set timeout = 500ms; if (retries >= 3) { log("error: 404"); } // about 50% of bugs hide right here.',
  },
  {
    id: 'master-gettysburg-address',
    title: '葛底斯堡演说・节选',
    difficultyId: 'master',
    content:
      'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.',
    source: '林肯《葛底斯堡演说》（1863，公有领域）',
  },
  {
    id: 'master-the-raven',
    title: '乌鸦・节选',
    difficultyId: 'master',
    content:
      'Once upon a midnight dreary, while I pondered, weak and weary, Over many a quaint and curious volume of forgotten lore.',
    source: '爱伦·坡《乌鸦》（1845，公有领域）',
  },
  {
    id: 'master-julius-caesar',
    title: '凯撒大帝・节选',
    difficultyId: 'master',
    content:
      'Friends, Romans, countrymen, lend me your ears; I come to bury Caesar, not to praise him.',
    source: '莎士比亚《凯撒大帝》（公有领域）',
  },
];

/** difficultyId -> ArticleDifficulty 查找表 */
const DIFFICULTY_MAP = new Map<string, ArticleDifficulty>(
  ARTICLE_DIFFICULTIES.map((d) => [d.id, d])
);

/** 按 id 获取难度分级（不存在时返回 undefined） */
export function getArticleDifficulty(id: string): ArticleDifficulty | undefined {
  return DIFFICULTY_MAP.get(id);
}

/** 按 id 获取预装文章（不存在时返回 undefined） */
export function getPresetArticle(id: string): PresetArticle | undefined {
  return PRESET_ARTICLES.find((a) => a.id === id);
}

/**
 * 返回顺序练习中的下一篇（由浅入深）。
 * @param currentIndex 当前文章在 PRESET_ARTICLES 中的索引；传 -1 表示尚未选择，返回第一篇。
 * @param wrap 到达末尾时是否回到开头（默认 true）。
 */
export function nextPresetArticle(currentIndex: number, wrap = true): PresetArticle | null {
  if (PRESET_ARTICLES.length === 0) {
    return null;
  }
  if (currentIndex < 0) {
    return PRESET_ARTICLES[0];
  }
  const next = currentIndex + 1;
  if (next < PRESET_ARTICLES.length) {
    return PRESET_ARTICLES[next];
  }
  return wrap ? PRESET_ARTICLES[0] : null;
}

/** 随机返回一篇预装文章（可排除指定 id，避免连续抽到同一篇） */
export function randomPresetArticle(excludeId?: string): PresetArticle | null {
  if (PRESET_ARTICLES.length === 0) {
    return null;
  }
  if (PRESET_ARTICLES.length === 1) {
    return PRESET_ARTICLES[0];
  }
  let picked = PRESET_ARTICLES[Math.floor(Math.random() * PRESET_ARTICLES.length)];
  // 最多重试若干次以避开上一篇文章
  let guard = 0;
  while (excludeId && picked.id === excludeId && guard < 8) {
    picked = PRESET_ARTICLES[Math.floor(Math.random() * PRESET_ARTICLES.length)];
    guard++;
  }
  return picked;
}
