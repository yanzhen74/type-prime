# 打字基本法（Type Prime）项目实施方案

> 本方案按用户需求的三大块组织：
>
> 1. **指法训练**：标准键位指法练习，覆盖标准全尺寸键盘全部键位。
> 2. **单词记忆与词库管理**：单词/文章输入练习 + 词库范围管理 + 记忆曲线复习。
> 3. **指法游戏**：闯关射击与僵尸大战同属游戏类，不是两个并列阶段；闯关射击从单字母起步，逐级过渡到字母组合、单词、短语。
>
> 公共底座（`TypingEngine`、`VocabularyBank`、`ReviewScheduler`、`UserProgress`）作为贯穿三块的技术支撑，不单独成阶段。

## 1. 项目现状分析

### 1.1 已完成的模块与功能

当前代码已实现打字基本法（Type Prime，仓库标识 `type-prime`）——一个基于 TypeScript + HTML5 Canvas 的浏览器端指法训练应用，主要包含：

- **基础指法训练**：`KeyboardRenderer` 渲染虚拟键盘，按键时高亮对应键位并提示左右手与手指；下方有静态手指示意图与图例。
- **单词掉落游戏**：`FallingWordGame` 实现单词从屏幕上方掉落、逐字符输入击落、自动锁定最紧急目标、倒计时、暂停、Backspace、分数/生命/等级/准确率统计与游戏结束逻辑。
- **用户与排行榜**：`UserStorage` 使用 `localStorage` 保存多用户数据，支持默认 3 用户、添加用户、最高分与总场次统计，并按最高分排序展示排行榜。
- **工程化**：TypeScript、ESLint、Prettier、Vitest 单元测试（`storage.test.ts`）、GitHub Actions CI。

> 注意：上述为项目初期已实现的基础内容，后续需求（分层指法训练、完整键盘覆盖、词库与记忆曲线、两款指法游戏）均需在此基础上增量扩展，不推翻重来。

### 1.2 待完成的功能差距

对照新的完整需求，当前项目仍有以下主要差距：

- **指法训练**：仅有静态高亮，缺少按键动态动画、指定键位练习模式、文章跟打练习、逐键统计与错误热力图。
- **单词记忆与词库管理**：词库硬编码在 `game.ts` 中（仅 29 个单词），无分类、难度、导入导出、掌握度追踪与遗忘曲线复习调度。
- **游戏模块**：仅有“单词掉落”一种玩法，缺少“闯关射击（从单字母到复杂单词逐级闯关）”和“僵尸大战（单词消灭僵尸）”两种游戏模式。
- **公共能力**：输入处理与游戏面板耦合，缺少统一的输入引擎、音效、粒子特效与跨模式数据打通。

---

## 2. 模块一：指法训练与单词/文章输入模块

本模块负责标准键位指法训练，同时承担用户描述的“单词/文章输入练习”需求：所有练习均基于标准指法输入，通过指法输入来记忆单词与文章。

### 2.1 功能需求

1. **虚拟键盘实时反馈**
   - 按下任意键时，对应键位高亮并显示推荐手指与左右手。
   - 键帽增加按下/弹起的动态动画，提升手感。
   - 支持大小写、数字、符号键的完整布局提示。

2. **自由指法训练**
   - 用户随意按键，系统即时反馈键位、手指、左右手。
   - 记录按键次数、正确率、每个手指/键位的使用频率与错误次数。

3. **指定键位/字母练习**
   - 系统按难度顺序逐个提示字符，用户跟随输入。
   - 错误时给出视觉与声音反馈，并重复提示易错键。
   - 练习结束后展示正确率、耗时、WPM/CPM、错误键位分布。

4. **文章跟打练习**
   - 加载预设文章或用户导入文本，按原文逐字输入。
   - 实时滚动、已输入/待输入高亮、下一键指法提示。
   - 统计整篇文章的用时、WPM、CPM、准确率、退格次数、错误单词。

### 2.2 实现步骤

1. 重构 `KeyboardRenderer`
   - 为键位添加 CSS 按下动画类，支持通过代码触发“预期下一键”高亮。
   - 暴露 `hintNext(code: string)` 方法，用于在练习中提示下一个应输入的键。
   - 保持现有手指示意图高亮能力不变。

2. 新建 `TrainEngine`
   - 负责生成练习序列（随机键位、随机单词、文章文本）。
   - 接收输入事件，比较预期字符与实际字符，记录正误。
   - 向上层派发 `onProgress`、`onMistake`、`onComplete` 事件。

3. 新建 `TrainPanel` UI
   - 在 `index.html` 中增加指法训练面板，包含“自由训练 / 键位练习 / 文章练习”三个子标签。
   - 显示练习文本、输入统计、下一键提示、结果弹窗。

4. 统计与持久化
   - 将每次练习的统计数据写入 `UserProgress`（见模块二）。
   - 生成错误键位热力图，用于后续复习推荐。

### 2.3 技术要点

- **键码与字符映射**：使用 `KeyboardEvent.code` 处理物理键位，`event.key` 处理实际字符；注意 Shift 状态对符号的影响。
- **IME 兼容**：文章练习继续使用隐藏输入框 + `input` 事件，复用 `main.ts` 中已有的 IME 处理方案。
- **性能**：键盘高亮使用 CSS 类切换，避免频繁重绘 DOM；手指图高亮通过 `hand:finger` 复合键定位。
- **可访问性**：为训练文本添加 `aria-live` 提示，支持屏幕阅读器。

---

## 3. 模块二：单词记忆与词库管理模块

### 3.1 功能需求

1. **词库管理**
   - 支持按难度（初级 / 中级 / 高级）、主题（日常 / 编程 / 商务 / 自定义）分类。
   - 提供导入/导出 JSON 词库功能。
   - 支持添加、删除、编辑单词与分类。

2. **单词元数据**
   - 每个单词记录：文本、难度、分类、错误次数、连续正确次数、掌握度等级、上次复习时间、下次复习时间。

3. **记忆曲线与复习调度**
   - 基于 SM-2 算法或艾宾浩斯遗忘曲线计算下次复习时间。
   - 根据用户回答结果（正确 / 错误）动态调整间隔。
   - 每日生成“今日复习”队列，优先复习到期单词和高频错误单词。

4. **跨模块集成**
   - 练习模式可从复习队列中抽取单词。
   - 游戏模式可按难度/主题从词库中抽取单词。
   - 用户答错时自动更新单词记忆状态。

### 3.2 实现步骤

1. 扩展类型定义（`src/core/types.ts`）
   - 新增 `WordEntry`、`VocabularyCategory`、`ReviewState`、`MasteryLevel` 等类型。

2. 新建 `VocabularyBank`
   - 负责词库的加载、保存、查询、分类、导入导出。
   - 提供 `getWords(options)`、`addWord`、`removeWord`、`importJSON`、`exportJSON` 方法。
   - 使用独立的 `localStorage` key（如 `typeprime_vocabulary`）。

3. 新建 `ReviewScheduler`
   - 实现 SM-2 间隔重复算法：根据单词上一次间隔、重复次数、易度因子计算下一次复习时间。
   - 提供 `getDueReviews()`、`recordResult(wordId, isCorrect)` 方法。

4. 新建词库管理 UI
   - 在“练习/词库”面板中展示分类列表、单词列表、添加表单、导入/导出按钮。
   - 展示每个单词的掌握度、下次复习时间。

5. 与游戏/练习模块对接
   - `FallingWordGame`、`TypingShooterGame`、`ZombieTypingGame` 均从 `VocabularyBank` 按难度取词。
   - 练习模式调用 `ReviewScheduler.getDueReviews()` 生成复习内容。

### 3.3 技术要点

- **localStorage 版本化**：词库数据结构增加 `version` 字段，未来升级时自动迁移旧数据。
- **日期处理**：使用 UTC 时间戳或本地日期字符串，避免时区导致的复习时间错乱。
- **复习优先级排序**：综合考虑 `dueDate`（到期时间）、`errorCount`（错误次数）、`difficulty`（难度）。
- **数据一致性**：单词 ID 使用稳定值（如哈希或全局唯一 ID），避免重名导致状态混乱。
- **默认词库**：保留当前 29 个单词作为默认“入门”词库，并额外准备几组主题词库 JSON。

---

## 4. 模块三：游戏模块（闯关射击 + 僵尸大战）

### 4.1 公共游戏框架

为避免两个游戏各自维护 Canvas 循环、输入、音效、粒子，先建立公共能力：

1. **GameEngine 基类**
   - 统一 `start()`、`pause()`、`reset()`、`loop()` 生命周期。
   - 管理 `GameState`：分数、等级、生命、暂停、运行中、倒计时。
   - 接收 `TypingEngine` 输入事件，派发给子类处理。

2. **ParticleSystem**
   - 管理子弹、爆炸、火花等粒子对象。
   - 使用对象池减少 GC 压力。

3. **SoundManager**
   - 基于 Web Audio API 或 `<audio>` 标签，按需加载音效。
   - 提供 `play(key)` 接口：shoot、hit、miss、gameOver、levelUp。

4. **DifficultyScaler**
   - 根据等级/波次动态调整敌人生成速度、移动速度、单词长度、组合复杂度。

### 4.2 子模式 A：闯关射击

#### 功能需求

- 屏幕上不断出现携带输入目标的目标/敌人；早期关卡为单字母，后续关卡逐步增加字母组合、单词、短语。
- 用户输入正确字符即发射子弹，击毁对应目标。
- 连续正确形成“连击”，连击数越高得分加成越高。
- 每关设置目标分数或存活时间，达成后进入下一关；关卡越高，目标移动越快、输入内容从单字母过渡到字母组合、单词甚至短语。
- 特定关卡出现 BOSS：需要按顺序输入一串字符、单词或短语才能击毁。

#### 实现步骤

1. 新建 `TypingShooterGame extends GameEngine`。
2. 定义 `Target` 对象：位置、速度、待输入内容（单字母/组合/单词/短语）、生命值。
3. 实现 `spawnTarget()`：根据关卡难度随机生成单字母、字母组合、单词或短语，控制生成位置避免重叠。
4. 处理输入：在活跃目标中查找输入内容匹配的目标；单字母关卡即时击毁，单词/组合关卡可逐字符锁定并击毁；未命中则记录失误。
5. 实现关卡推进：达到目标分数后清空屏幕，播放升级音效，进入下一关。
6. 增加结果页：展示本局得分、最高连击、准确率、击毁数。

#### 技术要点

- **目标锁定策略**：多个目标存在输入前缀冲突时，优先锁定最危险（最靠近底部/玩家）的目标。
- **对象池**：目标、子弹、粒子均使用对象池复用。
- **碰撞检测**：子弹与目标使用圆形或矩形包围盒检测。
- **动画**：目标被击毁时触发粒子爆炸，BOSS 受击时显示护盾闪烁。

### 4.3 子模式 B：僵尸大战（单词消灭僵尸）

#### 功能需求

- 僵尸从屏幕一侧（通常是右侧）向左侧基地/玩家移动。
- 每个僵尸头顶或身上显示一个待输入单词。
- 用户正确输入完整单词后，该僵尸被消灭并播放死亡动画。
- 僵尸到达基地时扣除基地生命值；基地生命为 0 则游戏结束。
- 设计波次系统：每波僵尸数量、速度、单词难度递增；后期出现“坦克僵尸”（高血量需多次输入）和“BOSS 僵尸”（长单词或护盾）。
- 加入简单道具：清屏炸弹、减速、护盾恢复。

#### 实现步骤

1. 新建 `ZombieTypingGame extends GameEngine`。
2. 定义 `Zombie` 对象：位置、速度、单词、当前已输入进度、血量、类型。
3. 实现 `spawnWave()`：按波次配置生成若干僵尸，控制入场节奏。
4. 处理输入：采用与 `FallingWordGame` 类似的逐字符锁定机制；用户输入单词首字符后锁定该僵尸，继续输入完整单词即消灭。
5. 实现基地血量与游戏结束判定。
6. 实现道具系统：随机掉落道具，用户按对应快捷键触发。
7. 增加结果页与波次统计。

#### 技术要点

- **单词前缀冲突**：多个僵尸显示相同首字母单词时，优先锁定最靠近基地的僵尸；输入错误切换锁定需避免频繁跳变。
- **Canvas 渲染分层**：背景、僵尸/目标、粒子、UI 分层绘制，避免一帧内重复清除（已实现，见 §10.4.5）。
- **性能优化**：僵尸数量较多时，仅对屏幕内僵尸进行输入匹配；离屏僵尸可简化为位置更新。
- **复用现有逻辑**：`FallingWordGame` 中的目标锁定、单词进度、得分升级逻辑可直接迁移到 `ZombieTypingGame`。

---

## 5. 统一输入与数据打通

### 5.1 TypingEngine

- 监听全局 `keydown` 与隐藏输入框的 `input` 事件。
- 统一输出：
  - `onChar(char: string)`：用户输入一个可打印字符。
  - `onBackspace()`：用户按退格。
  - `onSubmit()`：用户按空格/回车。
  - `onEscape()`：用户按 Esc（暂停）。
- 根据当前激活的面板，将事件路由到训练引擎或对应游戏实例。

### 5.2 UserProgress

- 在现有 `UserStorage` 基础上扩展，新增字段：
  - `keyStats: Record<string, { correct: number; wrong: number }>`
  - `wordStats: Record<string, { encounters: number; correct: number; lastReview: number; nextReview: number }>`
  - `sessionHistory: TrainingSession[] / GameSession[]`
- 提供 `recordPractice()`、`recordGame()`、`recordWordResult()` 方法。

### 5.3 模块间调用关系

```
TypingEngine
  ├─> TrainEngine ──> KeyboardRenderer (next-key hint)
  ├─> FallingWordGame
  ├─> TypingShooterGame
  └─> ZombieTypingGame

VocabularyBank <──> ReviewScheduler
       │                  │
       ▼                  ▼
   游戏取词           练习/复习队列
       │                  │
       └──────> UserProgress <──────┘
```

---

## 6. 实施主线

用户需求整体分为三大块，实施时按以下顺序推进；公共底座（`TypingEngine`、`VocabularyBank`、`ReviewScheduler`、`UserProgress`）作为贯穿三块的技术支撑，不单独成阶段。

| 实施块                   | 目标                                                         | 主要任务                                                                                               | 优先级 |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| 块一：指法训练与输入练习 | 实现分层指法训练、键盘布局显示、标准文本对比、错误标记与纠正 | 重构键盘动画；实现 `TrainEngine` 与 `TrainPanel`；支持自由/键位/文章三种训练模式；实时统计与错误热力图 | 高     |
| 块二：单词记忆与词库管理 | 搭建词库体系与记忆曲线复习机制                               | 完善 `VocabularyBank` 与词库管理 UI；接入 `ReviewScheduler`；实现“今日复习”与掌握度可视化              | 高     |
| 块三：指法游戏           | 实现闯关射击与僵尸大战两款游戏                               | 提取 `GameEngine`；实现 `TypingShooterGame` 与 `ZombieTypingGame`；连击、关卡、波次、道具、结算        | 中     |
| 通用打磨                 | 提升整体体验                                                 | 音效、粒子、主题、动画；可选渲染层升级                                                                 | 低     |

---

## 7. 文件结构（目录模块化重构后现状）

原平铺预期已被「src 分模块子目录重构」取代（git mv 保留历史，测试与源同目录并存）：

```
type-prime/
├── PLAN.md / PROGRESS.md / README.md
├── index.html                  # 面板 DOM + 首屏防闪烁内联脚本（资源带 ?v=N）
├── style.css                   # CSS 变量 + html[data-theme] 主题块
├── vitest.config.ts            # jsdom 环境；vitest.setup.ts 过滤 jsdom 噪声
├── scripts/build-release.mjs   # esbuild 单文件产物（entry 仍为 src/main.ts）
├── src/
│   ├── main.ts                 # 唯一根级源文件：入口协调/面板路由/快捷键
│   ├── core/                   # 公共底座：types / storage / input / dialog
│   ├── render/                 # 表现层底座：theme / particle-system / layered-canvas
│   ├── train/                  # 块一：keyboard / keyboard-anim / train-engine / train-panel / articles
│   ├── games/                  # 块三：game-engine / game / typing-shooter-game / zombie-typing-game / sound-manager
│   └── vocab/                  # 块二：vocabulary / review / vocab-panel
│       └── assets/vocab/       # 词库数据：default-words / cet4 / cet6 / frequency / word-utils
└── dist/                       # tsc 输出（与 src 同构，rootDir src / outDir dist）
```

重构口径：

- 每个源文件同目录并存同名 `.test.ts`；新增模块按职责落入对应子目录，不再回平铺。
- import 规则：同目录 `./x.js` 不变；跨目录 `../<模块>/x.js`；main.ts 用 `./<模块>/x.js`；assets 深两级用 `../../../core/types.js`。
- 配置全部 glob 化（tsconfig include `src/**/*`、vitest exclude、eslint `src/`、prettier glob、build-release entry），子目录化无需改配置；后续新增子目录同样安全。
- 本文档与 PROGRESS.md、README.md 中的模块路径已全量对齐该结构。

---

## 8. 测试策略

- **单元测试**：`VocabularyBank` 的 CRUD、导入导出；`ReviewScheduler` 的间隔计算；`TypingEngine` 的事件分发；`UserProgress` 统计聚合。
- **集成测试**：训练引擎 + 键盘渲染的输入流程；游戏引擎完整一局运行并校验分数/状态。
- **端到端测试**：使用浏览器自动化验证页面切换、游戏开始/暂停/结束、词库导入导出。
- **CI 流水线**：保持现有 GitHub Actions，新增 `npm run test` 覆盖新增测试。

---

## 9. 验收标准

- [ ] 指法训练模块支持自由训练、键位练习、文章跟打三种模式，并输出正确率/WPM/CPM。
- [ ] 键盘输入范围覆盖标准全尺寸键盘的字母、数字、符号与功能键（Backspace/Enter/Escape）。
- [ ] 标准文本与用户输入逐字符对比，错误有即时视觉标记与纠正反馈。
- [ ] 词库支持分类、难度、导入导出；默认提供至少 3 组主题词库。
- [ ] 记忆曲线模块能生成每日复习队列，并根据用户正误调整复习间隔。
- [ ] 闯关射击游戏可正常开始、闯关、升级、结算；关卡从单字母逐步过渡到字母组合、单词、短语。
- [ ] 僵尸大战游戏支持波次、基地血量、多种僵尸类型与道具。
- [ ] 所有新增代码通过 ESLint、Prettier、Vitest 与 GitHub Actions CI。

---

## 10. 实施详细任务（三大块）

> 以下任务按用户需求三大块组织。公共底座（`TypingEngine`、`VocabularyBank`、`ReviewScheduler`、`UserProgress`）已在第一阶段完成，后续三块直接复用，不再作为独立阶段呈现。

### 块一：指法训练与输入练习（高优先级）

目标：实现分层指法训练、键盘布局显示、标准文本与用户输入对比、错误标记与纠正。

#### 1. 键盘渲染增强

- 扩展 `src/train/keyboard.ts`：为键位添加 CSS 按下/弹起动画。
- 新增 `hintNext(code)` 方法，在练习中高亮“下一个应输入键”。
- 保持现有 `highlight(code)` 与手指图高亮能力不变。

#### 2. 练习引擎（`src/train/train-engine.ts`）

- 生成随机键位序列、随机单词序列、文章文本序列。
- 接收 `TypingEngine` 事件，逐字符比对标准文本与用户输入，记录正误。
- 派发 `onProgress`、`onMistake`、`onComplete` 事件。
- 支持 Backspace 回退当前锁定进度。

#### 3. 练习面板 UI

- 在 `index.html` 扩展“指法训练”面板，包含“自由训练 / 键位练习 / 文章练习”三个子标签。
- 显示练习文本、已输入/待输入高亮、下一键提示、实时统计、结果弹窗。

#### 4. 文章导入

- 支持从文本框粘贴文章，或选择内置文章（如中小学课文片段、经典英文短文）。
- 实时滚动、WPM/CPM/准确率统计。

#### 5. 统计与持久化

- 练习结果写入 `UserProgress`：`recordKeyResult`、`recordWordResult`、`recordSession`。
- 生成错误键位热力图与易错词列表（已实现，见块一 §7「错误分析视图」）。

#### 6. 测试

- `TrainEngine` 序列生成、正误判定、事件派发测试。
- 键盘 `hintNext` 与动画测试。

#### 7. 错误分析视图（热力图 + 易错词 + 推荐练习）（已实现）

目标：把 §3.1 需求的「错误热力图 / 易错词列表 + 针对性强化」落地为训练面板第四个子标签「错误分析」（`Ctrl+Shift+4`，按 `e.code === 'Digit4'` 判定），形成「练习 → 统计 → 推荐练习 → 回写统计」闭环。

- 模块拆分：`src/train/error-stats.ts` 纯函数聚合层（`buildKeyHeat` / `summarizeKeys` / `weakKeyCodes` / `topErrorWords` / `drillCharOf`，常量 `MIN_SAMPLE=5` / `FULL_HEAT_RATE=0.5` / `WEAK_KEY_LIMIT=6` / `ERROR_WORD_LIMIT=10`）+ `src/train/stats-view.ts` DOM 控制器 `TrainStatsView`（deps 注入 rows/progress/vocabulary/onDrillKeys/onReviewWords，循 VocabPanel 模式）。视图不是练习模式，不进 `PracticeMode`；TrainPanel 以独立 `statsActive` 状态门控输入与快捷键（字符/Enter/Esc/Ctrl+方向键/Tab 均不转发）。
- 数据分母修复：历史 keyStats 只累计错误（correct 恒 0），`handleComplete` 新增按最终 charResults 补记正确击键（退格修正后判对计正确、换行剔除），使错误率 = wrong/(correct+wrong)；兼容历史 only-wrong 数据（低样本阻尼避免视觉失真）。
- 热力模型：errorRate 按 50% 满档映射 `--heat` 强度，乘低样本阻尼 min(1, attempts/5)；attempts≥5 且零错误判为已练熟（绿色 tint）。热力键盘复用 MINI_ROWS 布局（48 键），宽键按 width/44 放大，roving tabindex + 方向键漫游保全键盘操作；颜色走 `--danger-rgb/--success-rgb` 的 rgba 半透明 tint，三主题自动换肤、零 JS 主题监听。
- 推荐练习闭环：点击键帽 / 「练习薄弱键位」按钮 → `startWeakKeyDrill(keys)` 构造临时 TrainingLevel（id=weak-keys）复用 `generateKeyDrill` 三阶段序列与层级高亮，层级下拉动态插入「薄弱键位专项」选项、切常规层级即清除；易错词行 / 「复习全部易错词」→ `main.startReview` 复用 SM-2 回写链路。`startReview` 须显式 `exitStatsView()`（mode 已是 word 时不走 switchMode，浏览器实测发现的回归，已补单测）。
- 焦点保护：`#train-stats-view` 委托 focusin/focusout 到 suspendTrainInput/releaseUserControlFocus；exitStatsView 对正在聚焦的统计控件主动 blur 触发释放，避免隐藏输入框保持 disabled。
- UI：概览 chips（总击键/错误/正确率/覆盖键位）、热力图例、易错词表（单词/释义/错误/练习/错误率/掌握度徽章/复习）、最近练习（模式徽章 + 正确率 + WPM 或分数 + 时间，复用 sessions）；空态引导文案；全部用户数据走 textContent 渲染。
- 测试：`error-stats.test.ts` 13 例 + `stats-view.test.ts` 10 例 + `train-panel.test.ts` 接线 7 例（含 startReview 退出回归）；基线 20 文件 326 例全绿，`build:release` 205.5 KB。
- jsdom 噪声源头静音：Vitest 的 console 拦截在 worker 初始化时捕获原始 console，绕过 setup 里的 console.error 覆写 → `vitest.setup.ts` 改为原型级 `HTMLCanvasElement.prototype.getContext` 返回 null（与未安装 canvas 包语义一致，实例级录制 ctx 不受影响），取代 §10.4.5 时期的 console 过滤方案。
- 浏览器 no-store 实测：空态 → 练习 → 热力（A 键 25% / --heat 0.5）→ 点击键帽专项 → 薄弱按钮 → 三主题换肤 → 切面板状态保持 → F1 帮助 → 900px 单列响应式；易错词闭环（敲错不回退 → 列表行 → 单行复习 / 复习全部 → 视图切换）；全程控制台零报错。
- 未采取方案：把错误分析做成第四种 PracticeMode（污染 sessionMode/引擎状态）、JS 监听主题换色（CSS 变量已自动换肤）、每次 refresh 重建键帽 DOM（监听器叠加）。

#### 8. 键位练习按层级记忆练习阶段（已实现）

目标：修复「切换练习层级携带旧阶段，初学者大概率直接跳到阶段 3」的问题，并举一反三治理同族状态丢失/串扰。

- 数据模型：`src/core/types.ts` 新增 `KeyDrillProgress`（`levelId` 最近常规层级 + `phases` 层级 id → 阶段下标），`UserProgressData.keyDrill?` 可选兼容旧数据；`src/core/storage.ts` migrate 补 `{}`、默认用户与 addUser 初始化 `{}`，新增 `getKeyDrillProgress()/setKeyDrillProgress()`（按用户隔离持久化）。
- 面板状态：`src/train/train-panel.ts` 新增 `phaseByLevel` 内存表与 `loadKeyDrillProgress()`（脏数据兜底：仅接受 [0,3) 整数阶段，未知 levelId 回退首层级）；`rememberPhase/restorePhaseFor/persistKeyDrillProgress` 三个 helper 统一「记住 → 切换 → 恢复 → 持久化」口径；未练过的层级一律从阶段 1 起步。
- 接线点：`cycleLevel` / `handleLevelChange` / `cyclePhase` / `handleNext` / `switchMode` / `startWeakKeyDrill` 全部接入；「下一关」跨层级恢复目标层级记忆阶段并清除专项 override（修复专项下悄悄推进常规层级的隐患）；薄弱键位专项独立记忆阶段（默认阶段 1，不继承常规阶段），经单词模式往返回到键位练习时恢复常规层级阶段。
- 切用户：`main.resetTrainPanel` 改调公开 `reloadUserProgress()`（清 override + 重载该用户层级/阶段记忆 + 重置练习），取代旧的 cast 调 resetPractice，练习进度不再跨用户串扰。
- 已审计无需改：wordPref/motion/theme/game settings 均已持久化；文章选择属内容选择非难度递进，保持现状。
- 测试：`train-panel.test.ts` 新增「按层级记忆练习阶段」9 例 + `storage.test.ts` 2 例（按用户持久化 / 旧数据迁移）；基线 20 文件 337 例全绿，`build:release` 207.1 KB。
- 浏览器 no-store 实测：切层级阶段不跳 3、未练层级从阶段 1、各层级独立记忆、刷新持久化（localStorage keyDrill 结构核对）、单词模式往返、切用户隔离，全程控制台零报错。

### 块二：单词记忆与词库管理（高优先级）

目标：搭建词库体系与记忆曲线复习机制，单词记忆通过“用指法输入单词”完成。

#### 1. 词库管理 UI

- 新增“词库”面板：分类列表、单词列表、添加/编辑/删除、导入/导出。
- 展示单词掌握度与下次复习时间。

#### 2. 复习调度接入

- `ReviewScheduler.recordResult` 更新掌握度与复习间隔。
- “今日复习”入口，一键开始复习练习。

#### 3. 复习练习模式

- `TrainEngine` 支持从复习队列取词生成练习序列。
- 答错时增加错误计数并缩短复习间隔。

#### 4. 掌握度可视化

- 词库列表中用颜色/图标区分 `new` / `learning` / `reviewing` / `mastered`。

#### 5. 测试

- 复习调度算法测试；词库 UI 交互测试。

### 块三：指法游戏（中优先级）

目标：实现闯关射击与僵尸大战两款游戏，二者同属游戏类，不是两个并列阶段。

#### 1. 公共游戏框架

- 新建 `src/games/game-engine.ts`：统一生命周期、状态管理、暂停/恢复、输入接入。

#### 2. 闯关射击（`src/games/typing-shooter-game.ts`）

- 目标生成：单字母 → 字母组合 → 单词 → 短语，难度递增。
- 输入匹配：单字母即时击毁，单词/组合可逐字符锁定。
- 连击、关卡推进、BOSS 关卡、结果页。

#### 3. 僵尸大战（`src/games/zombie-typing-game.ts`）

- 僵尸对象、波次系统、基地血量。
- 输入锁定与冲突处理。
- 普通/快速/坦克/BOSS 僵尸、道具、结果页。
- 僵尸造型改进（用户手动测试后追加）：`draw()` 中为四类僵尸绘制可辨识造型（头/躯干/手臂/腿部轮廓或简笔精灵），体型、配色、细节明显区分，行走可加轻微摆动/步态动画；纯 Canvas 2D 绘制、不引入图片资源与额外依赖，造型不得遮挡携带单词与血条。

#### 4. 表现层打磨

- 音效系统 `src/games/sound-manager.ts`（已实现）。
- 粒子系统 `src/render/particle-system.ts`（已实现）。
- 主题切换（已实现，见 §10.4.3）、键盘动画（已实现，见 §10.4.4）、Canvas 分层渲染（已实现，见 §10.4.5）。
- 可选 WebGL/PixiJS 评估。

##### 4.1 音效系统实现口径（已交付）

- 合成而非资源：全部音效由 WebAudio 实时合成（单振荡器 + 增益包络），不引入音频文件与第三方依赖，与项目「纯代码绘制/合成」口径一致；音色参数抽为纯数据表 `SFX_SPECS`（波形/起止频率/时长/峰值增益）便于调音与单测。
- 事件名统一：`GameSfx` 为三个模式事件名的并集，各游戏只定义自己的子集（`FallingSfx` / `ShooterSfx` / `ZombieSfx`）并通过 `onSfx?: (name) => void` 钩子向外报事件；游戏侧不持有播放器引用，因此音效可整体关闭而不影响任何判定与测试。
- 钩子位置：单词掉落（key/error/destroy/levelup/hurt/gameover）、闯关射击（shoot/error/hit/destroy/levelup/hurt/boss/gameover）、僵尸大战（沿用已有 shoot/hit/kill/miss/miss-hit/splat，新增 hurt/heal/levelup/gameover）；`gameover` 统一由子类覆写 `protected gameOver()` 先发音效再调 `super.gameOver()`，胜负两条路径都覆盖。
- 自动播放策略：AudioContext 懒创建（首次 `play()` 就发生在按键手势里），另在「开始游戏」按钮/Enter 与音效开关处显式 `unlock()`；suspended 时自动 `resume()`；环境不支持 WebAudio（如 jsdom）时全部方法退化为 no-op。
- 防噪：同名音效 30ms 节流（快速连打不堆叠削波），逐字符音效（key/shoot/hit）峰值增益刻意低于事件音效；总音量默认 0.6 可设。
- 开关与持久化：设置行新增「音效」下拉（on/off）+ `Ctrl+Shift+5`；该开关只切换播放器状态而**不重建游戏实例**（区别于其他设置项），避免调音量时打断当前局；值存入 `typeprime_game_settings.sound`，开启时顺手播一声反馈。
- 测试与验证：`sound-manager.test.ts`（12 例：音色表合法性与覆盖、合成参数/包络/时长、关闭不创建上下文、节流、无 WebAudio 降级、suspended 自动 resume、音量夹取）+ 三个游戏各补 onSfx 事件断言；浏览器实测三模式发声、关闭后振荡器创建数为 0、刷新后设置保留、控制台零报错。
- 未采取方案：外部音频文件/音频精灵（违反零资源口径、离线单文件体积膨胀）、第三方音效库（新增依赖）、在每个游戏内部直接建 AudioContext（三个模式会重复实现且无法统一静音）。

##### 4.2 粒子系统实现口径（已交付）

- 零资源零依赖：轻量粒子池 + 纯 Canvas 2D 绘制，四种形状（dot 碎块 / spark 拖尾线段 / smoke 扩散烟团 / ring 冲击环），不引入图片与第三方库，与音效系统同口径。
- 纯数据预设表 `PARTICLE_PRESETS`：八类事件（hit/kill/destroy/splat/hurt/heal/levelup/boss）各定义数量/基准速度/散布/主方向扇形/寿命/尺寸/重力/阻尼/配色/形状；逐字符级的 hit 刻意小而短，事件级的 kill/levelup 更大更久；splat/heal 用非正重力让烟尘与光点上飘；hurt/heal 限定向上扇形。
- 帧内计时不变量：`update(dt)` 只按调用方注入的 dt 推进，内部绝不取 performance.now()；单帧步长上限 `MAX_PARTICLE_STEP = 50ms` 吸收切标签页/rAF 停顿后的巨大 dt；池上限 `MAX_PARTICLES = 400`，超出丢弃最老粒子。
- 不污染状态：粒子池是游戏实例的 protected 成员，不进入 state（避免 onUpdate 每帧携带大数组、避免既有测试快照失真）；测试经测试子类的 `particleCount` 与 `snapshot()` 观察轨迹。
- 生命周期接线：基类 `reset()` 新增 `onReset()` 钩子（createState 之后、draw 之前调用），三个游戏覆写清池并重置 `lastUpdateAt = -1`；`onResume` 同样重置该哨兵，避免暂停恢复后首个大 dt 让粒子瞬移。
- 事件点：单词掉落（击落 destroy、触底 hurt、升关 levelup+ring）；闯关射击（击毁 destroy 且 BOSS 放大 1.8、破甲 hit、BOSS 登场 boss+ring、触底 hurt、升关 levelup+ring）；僵尸大战（击杀 kill 按 `KILL_PARTICLE_SCALE` 体型放大、破甲 hit、实弹命中 hit、哑弹落地 splat、跳弹 hit 半号、触底 hurt、道具 heal、波次 levelup+ring、BOSS 登场 boss+ring）。
- 取代与保留：装饰性 emoji 飘字（💥/✦/💨/🥀）改由粒子表现；带信息量的文案飘字（🔧 基地+1 / ❄ 冻结2s / +50 / ✗错字符）与闯关射击的扩散环特效保留。
- 测试与验证：`particle-system.test.ts` 23 例（预设表合法性与覆盖、发射数量与 scale、rng 恒 0 时方向/颜色/寿命可预测、dt 推进与重力/阻尼、寿命到期移除、步长上限、池上限、clear、四种形状的绘制调用与 globalAlpha 淡出）；三个游戏各补粒子断言（击杀/命中/落地/触底/消散/reset 清池）；浏览器用「全项目仅粒子系统写 ctx.globalAlpha」这一事实做写入计数探针，实测三模式粒子渲染且装饰 emoji 归零、控制台零报错。
- 未采取方案：图片/精灵图粒子（违反零资源口径）、第三方粒子库（新依赖）、把粒子放进 state（污染 onUpdate 与测试快照）、每帧新建粒子数组（GC 抖动）。

##### 4.3 主题切换实现口径（已交付）

- 三主题：深空夜 night（默认，原深色版面色）/ 纸墨白 paper（浅色护眼）/ 磷光绿 phosphor（复古终端）。顶栏新增「主题」下拉 + 全局快捷键 `Ctrl+Shift+6` 循环（不用 Ctrl+Shift+T 是被浏览器「恢复关闭的标签页」占用）；F1 帮助「全局」组与页脚补对应行。
- 双源配色、各自单一来源：DOM 侧全部走 `style.css` 的 `html[data-theme]` 变量块（含 `--board/--on-accent/--kbd-bg/--hand-left/--hand-right` 与半透明 tint 用的 `--*-rgb` 三元组）；Canvas 侧集中在 `src/render/theme.ts` 的纯数据表 `THEMES[name].canvas`（17 个 token：board/grid/ink/muted/accent/accentSoft/success/danger/dangerHot/dangerSoft/warn/onAccent/scrim/scrimHeavy/shadow/handLeft/handRight）。不在 TS 里重复维护 CSS 值，也不在 CSS 里写 Canvas 色。
- 世界色不随主题变：僵尸躯体配色、植物炮台、炮弹、粒子预设、手指身份色、BOSS 紫、冻结蓝属于「游戏世界标识色」，三主题下恒定（均为饱和中间调，深浅底都可读）；随主题变的只有版面色（底/网格/文字/遮罩/语义色/左右手底色）。
- 取色不重建实例：`GameEngineOptions.getPalette?: () => CanvasPalette`，基类持有 `protected readonly getPalette`（缺省夜），`main.ts` 注入 `ThemeManager.provider()`（活取色函数）；三个游戏与缩略键盘的绘制代码只从 token 取色，半透明处用 `alpha(hex, a)` 复用版面色。基类新增 `redraw()`、`TrainPanel.redraw()` 供主题变更时刷新静止画面（运行中由 rAF 自然覆盖）。
- ThemeManager 职责：持有当前主题、读写 `typeprime_theme`（存储不可用时仅内存生效）、同步 `html[data-theme]`、`onChange` 广播（返回退订函数）、`cycle()` 按 THEME_ORDER 循环；`set` 同值早退避免重复通知与写存储。
- 首屏防闪烁：`index.html` 头部内联脚本在样式生效前读存储写 `data-theme`，`<html>` 默认带 `data-theme="night"` 兜底；ThemeManager 构造后再 `applyDom()` 一次。
- 焦点保护：主题下拉在顶栏（四个面板都可操作），focus 时同时 `suspendTrainInput()` + 置 `gameControlFocused`，blur/change 后 `releaseUserControlFocus()` 交还焦点，避免训练/游戏隐藏输入框的自动重聚焦抢走下拉焦点。
- 可读性顺手修复：强调色实底按钮/激活标签内的 kbd 改为继承按钮文字色 + 透明底 + 同色描边（原 muted 灰在亮底上对比不足）；`.train-level-select` 加 flex-wrap 与 label/hint 不收缩，修复窄视口下层级提示被挤成竖排单字。
- 测试与验证：`theme.test.ts` 22 例（主题表完整性与三主题可辨识、alpha 钳制与非 hex 原样、isThemeName/loadStoredTheme 回退、set/cycle/provider/onChange/存储不可用、三游戏 redraw 取色接线与「换色不重建实例」）；`train-panel.test.ts` 补 3 例缩略键盘取色与 redraw。浏览器实测：三主题 DOM 变量与 Canvas 取色探针逐色核对、三模式可玩、快捷键循环、刷新持久化、运行中/练习中切主题不抢焦点不打断、控制台零报错。
- 未采取方案：CSS `color-mix()`（旧浏览器不支持会整片丢背景）、在 TS 里读 `getComputedStyle` 取 Canvas 色（每帧读样式性能差且 jsdom 不可测）、切主题重建游戏实例（打断当前局）、把主题色混进世界色（破坏僵尸/手指的认知一致性）。

##### 4.4 键盘动画实现口径（已交付）

- 动画与绘制分离：`src/train/keyboard-anim.ts` 的 `KeyboardAnimator` 是纯数值状态机（press/error/hint/layer/ripple 五通道 + idle 呼吸），只暴露 `update(now)` / `visual(code)` / `active`；`MiniKeyboardCanvas`（train-panel.ts）负责 rAF 取数绘制。动画不持有 ctx、绘制不持有计时，二者可独立单测。
- 帧内计时不变量：与粒子系统同口径，`update(now)` 只按调用方注入的时间戳推进，首帧 dt 哨兵 `-1`（dt=0），单帧步长上限 `MAX_KEY_ANIM_STEP = 50ms` 吸收切标签页后的巨大 dt；内部绝不取 `performance.now()`。`active` 为假（无通道且无需呼吸）时 rAF 循环自然停止，不空转。
- 参数纯数据表 `KEY_ANIM`：press 55/200ms + squash 0.06 + travel 3.5（easeOutBack 回弹过冲是设计特性，端点显式归 0/1）；error 340ms、40ms 起振、amp 3.6、3 周期横向抖动；hint 1500ms 呼吸 lift 1.4 / glow 5–14 / fill 0.26–0.44；layer 260/180ms + stagger 22 逐键渐入（键位练习层级高亮）；ripple 420ms / spread 0.55 / alpha 0.5，池上限 `MAX_KEY_RIPPLES = 12` 超出丢最老。
- 键座/键帽双层绘制：先画不随动画变换的键座，再对键帽以中心为原点施加 `translate(shake, dy)` / `scale` 后叠半透明状态色与描边（强度由通道给出，过渡连续）；实色强调/危险底（press>0.5 或 error>0.5）字色切 `pal.onAccent`，修复 paper 主题深红/深青底上深字不可读。
- 起停与可见性：`setPanelVisible(false)` 停循环、`true` 恢复；练习完成/重置后无通道即停；`destroy()` 取消 rAF 并退订。重复切换面板不叠循环（浏览器实测单循环约 244 次绘制/帧、~95fps）。
- 降级双通道：系统 `prefers-reduced-motion` 与用户开关共用 reduced 通道（纯色块停留 80/320ms、无位移无抖动）；DOM 手指图示由 `MiniHandsDiagram.setMotion()` 切 `.mini-hands--static`（animation/transition:none）+ 媒体查询双兜底，开关与系统偏好任一生效都静态，颜色与手指身份标识保留。
- 开关与持久化：键盘参考区标题行右侧「动画：开/关」按钮 + 全局 `Ctrl+Shift+7`（按 `e.code === 'Digit7'` 判定避开 Shift 布局差异）；值存 `typeprime_train_settings.motion`，存储损坏回退默认；系统 reduce 时默认关、显式存储优先。F1 帮助「指法训练」组与页脚补对应行；标题行 `.keyboard-ref-bar` 加 flex-wrap 防窄视口挤压。
- 顺手修复两个既有缺陷：① 完成态 `hideCursor()` 摘除光标后回退再输入，`syncInputSpans()` 的 `insertBefore(span, cursorEl)` 抛 NotFoundError（浏览器曾累计 53 条）→ 改为光标父节点判断 + appendChild；② `renderModeHint()` 写纯文本节点而 `syncTargetSpans()` 只增删 span，空文章态加载文章后目标行残留「选择一篇预装文章…」提示文案 → `renderPreview()` 先移除非元素子节点。各补回归测试。
- 测试与验证：`keyboard-anim.test.ts` 47 例（包络端点/过冲/抖动周期/呼吸/层级 stagger/ripple 池与淡出/步长上限/reduced 通道/active 起停）；`train-panel.test.ts` 新增 15 例动画（手动 rAF 队列精确控帧 + canvas Proxy 探针记录 fillStyle/translate/scale：按下收缩与过冲落定、错键平移偏离静止位、呼吸位移、层级 accent 描边 0→0.55 渐入、完成/切面板/destroy 停循环、开关与快捷键双向、aria/label/is-off/localStorage/手指静态同步、存储损坏回退、系统 reduce 默认关、显式存储优先、手指 tap/hint/miss 不牵连另一只手）+ 2 例回归。基线 17 文件 282 例全绿，`build:release` 182.2 KB。浏览器实测（须用 `Cache-Control: no-store` 服务器：dist 内部模块 import 无版本 query，启发式缓存会沿用旧模块）：按下帧键帽下沉且字可读、错键红底左偏、hint 青晕与拇指琥珀描边正确、切游戏面板 1.2s 绘制数 0 切回恢复、开关 off 绘制数 0 且手指静态、刷新持久化、完成结算与错键明细正常、控制台零报错。
- 未采取方案：第三方动画库（新增依赖且与帧内计时口径冲突）、每帧新建对象/数组（GC 抖动）、只做 CSS 过渡（canvas 键帽无法用 CSS 变换，也无法与错键/层级/涟漪通道合成）、把动画计时写进绘制函数（不可单测）。

##### 4.5 Canvas 分层渲染实现口径（已交付）

- 单主画布 + 离屏静态缓存，而非多张 canvas DOM 堆叠：不动现有 DOM/CSS 与探针测试结构；静态层（网格/板面/键座/基地线）绘进离屏缓存，每帧主画布只 `clearRect` 一次 + `drawImage` blit 一次，再按「实体 → 粒子 → 遮罩/HUD」有序绘制动态 passes。
- 底座 `src/render/layered-canvas.ts` 的 `LayeredCanvas`：`beginFrame(key, paintStatic)` 返回主 ctx；缓存失效三要素——`invalidate()` 显式作废、key 指纹变化（取版面色对象引用，换主题自动失效）、画布尺寸变化；`staticPaints`/`blits` 计数器作测试观察口；离屏不可用（jsdom/老环境）时降级为逐帧在主 ctx 直绘静态层，行为与分层前一致。
- 基类接线：`GameEngine` 新增 `protected readonly layers`，`redraw()` 先 `layers.invalidate()` 再 `draw()`；新增 `protected beginFrame(paintStatic?)` 以 `this.getPalette()` 为缓存指纹。三个游戏各拆出 `drawBackground(ctx, pal)`（掉落/射击为双向网格，僵尸为竖向网格 + 基地线）；僵尸「基地血量」文字属动态 HUD 保留在主画布。
- 缩略键盘接线：`MiniKeyboardCanvas` 板面底色 + 全部键座入静态缓存，涟漪 → 键帽每帧动态；`redraw()` 先 invalidate 保主题切换即时生效。
- 测试：`layered-canvas.test.ts` 9 例（底座 7：首帧重绘/blit、多帧命中、指纹/尺寸/invalidate 失效、降级、无 ctx 抛错；基类接线 2：同主题多帧静态层只绘一次、换主题与 redraw 都重绘）；`train-panel.test.ts` +2 例（板面/键座只绘一次且呼吸帧只 blit、redraw 作废缓存）。注意：离屏支持探针是模块级一次性缓存，接管 `createElement` 的 describe 必须在该文件最先执行。
- jsdom 噪声治理：`vitest.setup.ts` 在 worker 内过滤 `console.error` 的 `Not implemented:` 转发（VirtualConsole 实例含函数，无法经 environmentOptions 序列化进 forks worker；jsdom 29 的 API 为 `forwardTo(console, { jsdomErrors })`，旧 `sendTo` 已移除）。后续错误分析批次发现 Vitest console 拦截会绕过该覆写，已改为原型级 `getContext` 返回 null 的源头静音（见块一 §7）。
- 验证：基线 18 文件 293 例全绿，`build:release` 183.6 KB；浏览器 no-store 实测（探针计数 ctx 调用）：游戏每帧 drawImage 1 次（≈48/s），stroke 从分层前 40+/帧降至 1–3/帧；缩略键盘呼吸帧只 blit；三模式可玩、三主题切换即时重绘、切面板停循环/恢复、全局面板控制台零报错。
- 未采取方案：多张 canvas DOM 堆叠（改 DOM/CSS、层级与焦点复杂化、探针测试重写）、每帧全量重绘静态层（分层前原状，网格描边浪费）、WebGL/PixiJS 迁移（留作独立评估项，不属本次范围）。

#### 5. 测试（已覆盖）

- 游戏引擎状态机测试。
- 闯关射击与僵尸大战的输入匹配、关卡/波次、结算测试。
- 现状：上述范围已随各项任务逐步落地（`game-engine.test.ts` / `game.test.ts` / `typing-shooter-game.test.ts` / `zombie-typing-game.test.ts`），基线 13 个测试文件共 135 用例全绿；后续新增能力遵循同样口径补测试。

#### 6. 游戏面板设置全键盘化（交互增强，已实现）

目标：游戏面板的设置项（模式/起始等级/速度倍率/词源）全部可用快捷键调整，维持全键盘无鼠标。

- 快捷键映射（仅游戏面板激活时生效，capture 阶段拦截并 preventDefault/stopPropagation）：
  - `Ctrl+Shift+1/2/3`：切换游戏模式（单词掉落 / 闯关射击 / 僵尸大战）。
  - `Ctrl+↑ / Ctrl+↓`：起始等级 +1 / −1，1–10 循环。
  - `Ctrl+← / Ctrl+→`：速度倍率 降 / 升，在 0.5/0.75/1/1.5/2 间循环。
  - `Ctrl+Shift+4`：切换词源（内置词表 ↔ 词库单词），仅单词掉落模式有效；射击/僵尸下该下拉本就禁用，快捷键为 no-op。
- 冲突分析：`Ctrl+↑↓`/`Ctrl+←→` 现仅被训练面板绑定且 TrainPanel 内部已按 `isPanelActive()` 门控，游戏面板激活时空闲，无冲突；`Ctrl+Shift+数字` 命名空间已验证避开浏览器保留键。
- 生效语义：统一走现有 `handleGameSettingChange()`（持久化 typeprime_game_settings + 重建游戏实例，等价设置变更后自动重置当前局）；触发后同步刷新对应 select 显示值并把焦点交还 #game-input。
- 反馈与可发现性：触发后在设置行提示位闪现当前值约 1.5s；每个设置项旁加 kbd 标注；F1 帮助弹窗与底部提示栏补对应行，并将原「Ctrl+Shift+1/2/3 切换键位/单词/文章练习」加注「训练面板」以消除同名快捷键歧义。
- 边界：焦点在 select/textarea 时同样生效（与现有 Ctrl+1/2/3 一致）；命中即 stopPropagation 防止方向键泄漏进输入框或触发 caret 跳词。
- 实现要点：模式/词源快捷键用 `e.code`（Digit1–Digit4）判定而非 `e.key`，避开 Shift 使 `e.key` 变为 `!@#$` 的布局差异；等级与倍率用取模公式实现双向循环（`START_LEVEL_MIN/MAX`、`SPEED_STEPS` 常量化）。已经浏览器实测：三组快捷键均生效、循环边界正确（10→1、0.5→2）、zombie/shooter 下词源为提示型 no-op、训练面板的同名快捷键互不干扰、无控制台报错。

#### 7. 僵尸大战打击反馈增强（已实现）

目标：把「敲键 → 炮弹飞行 → 命中 → 掉血」做成可见因果链，并让打错字符也有完整的失败反馈。全部 Canvas 2D 纯绘制，不侵入判定逻辑（hp 仍为整轮扣血）。

- 头部血条（全僵尸）：按「层」显示，当前层剩余比例 = `1 - shownChars/单词长度`（满格为 1，每命中一个字符平滑掉一格，整轮打完正好掉光一层）；多血僵尸扣血时 `shownChars` 归零且换色（坦克蓝→黄→红），血条重新满格。血条贴头顶、携带单词上移避免重叠。纯函数 `headBarFraction(z)`。
- 坦克三段变色：`zombieBarColor(kind, hp)` —— tank 的 hp=3 蓝(护甲)/2 黄/1 红；其他类型红。
- 植物炮台：基地线中央绘豌豆射手风格植物（茎+头+炮口），头朝当前锁定僵尸；每正确字符后坐 + muzzle flash 并发射绿色种子炮弹。
- 炮弹命中：到达目标 → `shownChars++`、白闪 `flashUntil`、顿挫 `staggerUntil`(期间不移动)、火花 effect；目标已死亡则 fizzle 消散。
- Missed 哑弹（打错字符）：发射灰色哑弹(`miss:true`, 携带 `char`)；有锁定目标则朝其飞，接触时**零伤害**跳弹（速度反射 + 重力 `vx/vy` 下坠）+ 灰火花 + `✗<错字符>` 飘字；无锁定目标则斜上飞出注定落空；触地或超 TTL 时 splat 灰雾移除。逻辑层仍只走 recordError(mistakes++)。
- 趣味增强：连续打错时植物后坐幅度递增（打对重置）；哑弹落地小概率（rng 可注入）长出蔫花彩蛋，纯装饰。
- 预留音效钩子：发射/命中/击杀/哑弹处留 `onSfx?` 回调位，供后续 sound-manager 任务接线。
- 类型扩展：`Zombie` + `shownChars/flashUntil/staggerUntil`；新增 `Projectile { id, x, y, targetId, at, miss?, char?, vx?, vy? }`；`ZombieState` + `projectiles`。
- 测试新增约 7 用例：每正确字符生成炮弹；命中增 shownChars/血条降；坦克三段色；目标死亡 fizzle；错字符生成 miss 弹且零伤害；哑弹跳弹后触地 splat 移除；无锁定打错仍安全落地。

#### 8. 含空格文本输入与长文本难度治理（已实现）

背景：射击模式 `phrase`（'type fast'）、`BOSS_CONTENT`（'the quick brown fox jumps'）与僵尸 BOSS（'the plants will defend the lawn'）均含空格，但空格在 main.ts 被双重拦截（keydown 中 `e.key === ' '` 直接 preventDefault + submitWord；input 事件中 `char !== ' '` 跳过），导致 `typedIndex` 卡在空格位、这类目标永远打不完；且长句与短词同速移动，难度不合理。

- 空格作为真实字符（不自动跳过，避免养成不吃空格的错误习惯）：基类新增可覆写的 `expectedChar(): string | null`（返回当前锁定目标的下一期望字符，不接受输入/未锁定时 null），三个游戏子类各自覆写；main.ts 的 keydown 中 Space 改为「期望字符是空格则 `handleChar(' ')`，否则仍 `submitWord()`」，Enter 语义不变。
- 长文本速度补偿：基类导出纯函数 `lengthSpeedFactor(text) = clamp(8 / len, 0.4, 1)`（参考长度 8 字符以内不减速，下限 0.4 避免长句慢到失去压迫感）；单词掉落/闯关射击/僵尸大战三处 spawn 均将基础速度乘以该因子（公式纯函数签名不变，不破坏现有测试）。
- BOSS 数值下调（实机反馈「还是来不及打」后采纳）：僵尸 BOSS `ZOMBIE_HP.boss` 5→3（三轮输入即可击杀），`ZOMBIE_SPEED.boss` 0.25→0.1875（原值的 3/4）；与长度补偿（长句因子 0.4）叠加后，BOSS 实际移动速度约为普通僵尸的 1/7，输入总量从 150 字符降到 90 字符。
- 未采取的方案：自动吞空格（与用户「不能养成错误习惯」的要求相左）、缩短 BOSS 长句文本、长句拆分为多目标。
- 测试：`lengthSpeedFactor` 边界（短词=1、9 字符=8/9、31 字符=0.4）、基类 `expectedChar` 默认 null、射击与僵尸 BOSS 长句减速断言 + 打到词间空格时 `expectedChar() === ' '` 且敲空格推进 `typedIndex`。

---

## 11. 词库管理方案

### 11.1 词库分类体系

项目词库按“学段/场景 + 难度”进行两级分类。第一级为“词库集”，第二级为“难度标签”。

#### 11.1.1 中小学课文词库

- **小学语文（拼音/生字）**
  - 覆盖小学 1-6 年级语文课本中的常用字、词语、成语。
  - 难度按年级划分（1-2 年级、3-4 年级、5-6 年级）。
- **小学英语**
  - 覆盖人教版/外研版等主流教材的单词表。
  - 难度按年级划分。
- **初中语文**
  - 覆盖 7-9 年级课内重点字词、古诗文常见词。
- **初中英语**
  - 覆盖 7-9 年级课标词汇。

**来源规划**：

- 优先使用教育部门公开的《义务教育语文课程标准》《义务教育英语课程标准》附录词表（公共政策文件，可自由使用）。
- 补充开源项目整理的中小学字词表（如 CC0 或 MIT 协议的 GitHub 项目）。
- 用户自行导入课本单词（支持 CSV/JSON 导入）。
- 注意：直接复制出版社课文原文可能涉及版权，词库以“单字/单词表”形式提供，避免整段课文侵权。

#### 11.1.2 大学四六级词库

- **CET-4 词库**
  - 约 4500 词，覆盖四级核心高频词、中频词、低频词。
  - 难度标签：`core`（高频核心）、`medium`（中频）、`low`（低频）。
- **CET-6 词库**
  - 约 5500 词，覆盖六级核心词与四级进阶词。
  - 难度标签：`core`、`medium`、`low`。

**来源规划**：

- 使用网络上公开的大学英语四六级大纲词汇表（教育部考试中心发布的考试大纲附录）。
- 使用开源社区整理的四六级 CSV/JSON（如 MIT/CC0 协议项目）。
- 允许用户导入自己的背单词 App 导出文件（如 JSON/CSV/Excel）。

#### 11.1.3 其他扩展词库

- **编程术语**：常见编程关键字、API、命令、错误提示（如 `function`、`variable`、`async`、`return`、`npm install`）。
- **商务英语**：邮件、会议、职场常用表达。
- **日常口语**：高频生活词汇与短语。
- **考研/托福/雅思**：可选考试词汇包。
- **自定义词库**：用户自行创建与分享。

**来源规划**：

- 编程术语由项目自行整理，基于公开文档与常见代码片段。
- 商务/日常/考试词汇使用开源词表或公共领域资源。
- 自定义词库由用户通过 UI 导入，数据保存在本地 `localStorage`。

### 11.2 词库文件格式

词库以 JSON 文件形式存放在 `src/vocab/assets/vocab/` 目录，便于版本管理与按需加载。

#### 11.2.1 单条单词结构

```json
{
  "id": "cet4-0001",
  "text": "apple",
  "difficulty": 1,
  "category": "cet4",
  "tags": ["fruit", "daily"],
  "meaning": "苹果",
  "phonetic": "ˈæpl",
  "example": "I eat an apple every day."
}
```

对于中文词语：

```json
{
  "id": "primary-cn-0001",
  "text": "春天",
  "difficulty": 1,
  "category": "primary-chinese",
  "tags": ["season", "nature"],
  "pinyin": "chūn tiān",
  "meaning": "春季"
}
```

#### 11.2.2 词库文件结构

```json
{
  "version": 1,
  "name": "CET-4 核心词",
  "category": "cet4",
  "language": "en",
  "description": "大学英语四级核心词汇",
  "words": [
    { "id": "cet4-0001", "text": "apple", "difficulty": 1, ... },
    ...
  ]
}
```

### 11.3 运行时词库模型

- `VocabularyBank` 加载所有内置词库文件，并合并用户自定义词库。
- 用户可在 UI 中勾选启用/禁用某个词库集。
- 游戏/练习取词时通过 `{ categories, difficulties, limit }` 条件查询。
- 每个单词的运行时状态（错误次数、掌握度、下次复习时间）存储在 `UserProgress` 中，与词库文件分离。

### 11.4 初始内置词库清单

| 词库文件                     | 分类             | 预估词量 | 难度范围 |
| ---------------------------- | ---------------- | -------- | -------- |
| `primary-chinese-words.json` | 小学语文常用字词 | 2000+    | 1-3      |
| `primary-english-words.json` | 小学英语单词     | 800+     | 1-2      |
| `middle-chinese-words.json`  | 初中语文重点字词 | 1500+    | 2-4      |
| `middle-english-words.json`  | 初中英语单词     | 1200+    | 2-3      |
| `cet4-core.json`             | 大学英语四级     | 4500     | 2-4      |
| `cet6-core.json`             | 大学英语六级     | 5500     | 3-5      |
| `programming-terms.json`     | 编程术语         | 300+     | 2-5      |
| `daily-english.json`         | 日常英语         | 500+     | 1-3      |
| `sample-articles.json`       | 文章跟打素材     | 20 篇    | 1-4      |

### 11.5 版权与合规说明

- 内置词库优先使用教育部门发布的课标附录、开源协议数据或用户自主导入内容。
- 避免直接复制出版社课文原文；文章跟打素材使用公共领域文本或用户自行导入。
- 在 README 与词库面板中明确标注数据来源与使用协议。

---

## 12. 现有架构分析与扩展原则

### 12.1 当前技术架构

- **语言与构建**：TypeScript 5.4 + `tsc` 编译，输出到 `dist/`；`index.html` 以 ES Module 方式加载 `dist/main.js`。
- **模块规范**：`tsconfig.json` 使用 `module: ESNext`、`moduleResolution: bundler`，源码中通过 `.js` 扩展名导入（如 `import './types.js'`）。
- **运行环境**：浏览器端纯原生技术栈，无框架、无后端；HTML + CSS + Canvas 2D。
- **测试与质量**：Vitest + jsdom，ESLint + TypeScript-ESLint + Prettier，GitHub Actions CI 执行格式化检查、Lint、测试、构建。
- **数据持久化**：`localStorage`，当前仅用于 `UserStorage` 的用户与排行榜数据。
- **目录与模块划分**：
  - `src/core/types.ts`：集中类型定义。
  - `src/core/storage.ts`：`UserStorage` 类。
  - `src/train/keyboard.ts`：`KeyboardRenderer` 负责虚拟键盘与手指图渲染。
  - `src/games/game.ts`：`FallingWordGame` 负责 Canvas 单词掉落游戏。
  - `src/main.ts`：`App` 类负责 DOM 初始化、标签切换、事件绑定与模块协调。
  - `index.html` 与 `style.css`：页面结构与深色主题样式。
- **核心交互链**：`keydown`/`input` → `App` → `KeyboardRenderer` / `FallingWordGame` → `UserStorage`。

### 12.2 扩展原则（不推翻重来）

1. **保留现有模块行为**
   - `KeyboardRenderer`、`FallingWordGame`、`UserStorage` 的核心接口保持不变，仅通过新增方法或可选参数扩展。
   - 现有“单词掉落”游戏和基础指法训练继续可用。

2. **新增公共模块，解耦输入与业务逻辑**
   - 新增 `TypingEngine` 统一处理键盘/IME 输入，但 `main.ts` 仍作为总协调者，根据当前面板分发事件。
   - 新增 `VocabularyBank`、`ReviewScheduler`、`UserProgress` 作为独立服务，游戏与训练模块通过依赖注入使用。

3. **沿用现有类型与存储约定**
   - 继续在 `src/core/types.ts` 中集中新增类型。
   - `localStorage` key 采用 `typeprime_` 前缀，避免与现有 `typeprime_users` 冲突。
   - 数据结构支持版本号，未来升级可自动迁移。

4. **沿用现有 UI/样式体系**
   - 继续使用 CSS 变量与 `.panel`、`.tab-btn` 等现有类。
   - 新增面板通过 `index.html` 中新增 `<section class="panel">` 实现，由 `main.ts` 统一绑定。

5. **沿用测试与 CI 流程**
   - 新增模块同步编写 `*.test.ts` 测试文件。
   - 保持 `npm run lint && npm run test && npm run build` 通过作为每阶段合并标准。

6. **游戏模式复用而非重写**
   - 提取 `GameEngine` 基类封装 Canvas 循环、暂停、状态管理等通用逻辑。
   - `TypingShooterGame` 与 `ZombieTypingGame` 继承 `GameEngine`，保留 `FallingWordGame` 的独立实现，但允许其后续逐步迁移到基类。

---

## 13. 基于现有架构的实施安排

本安排确保所有开发都在当前架构上做“增量扩展 + 局部重构”，不引入新框架、不破坏已有功能。公共底座已在第一阶段完成，后续按三大块依次推进。

### 块一：指法训练与输入练习

- 扩展 `src/train/keyboard.ts`：新增 `hintNext(code)` 与按键动画，不改动现有 `highlight(code)` 行为。
- 新增 `src/train/train-engine.ts`：生成练习序列并校验输入。
- 扩展 `index.html`：在“指法训练”面板内增加子标签页（自由/键位/文章）。
- 扩展 `src/main.ts`：在训练面板激活时，将 `TypingEngine` 事件路由到 `TrainEngine`。

### 块二：单词记忆与词库管理

- 完善 `src/vocab/vocabulary.ts` 与词库管理 UI。
- 在 `src/vocab/review.ts` 中完善 `getDueReviews()` 与 `recordResult()`。
- 扩展 `src/main.ts` 与 `index.html`：新增“今日复习”入口。
- 让 `TrainEngine` 支持从 `ReviewScheduler` 取词生成复习练习。

### 块三：指法游戏

- 新增 `src/games/game-engine.ts`：提取通用游戏循环与状态管理。
- 新增 `src/games/typing-shooter-game.ts`：继承 `GameEngine`，复用 `TypingEngine` 输入。
- 新增 `src/games/zombie-typing-game.ts`：继承 `GameEngine`。
- 复用 `FallingWordGame` 的目标锁定与单词进度逻辑，迁移到基类或作为工具函数复用。
- 扩展 `index.html` 与 `src/main.ts`：接入游戏选择。
- 新增 `src/games/sound-manager.ts`、`src/render/particle-system.ts`，在 `GameEngine` 中预留钩子。

### 13.1 关键里程碑

| 里程碑       | 标志                                                                                     | 验收动作                                        |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 公共底座完成 | `TypingEngine`、`VocabularyBank`、`ReviewScheduler`、`UserProgress` 可独立运行并通过测试 | `npm run test`                                  |
| 指法训练完成 | 三种训练模式可用，键盘动画与下一键提示生效，错误标记与纠正生效                           | 手工体验 + 单元测试                             |
| 词库记忆完成 | 每日复习队列按 SM-2 生成并调整，掌握度可视化可用                                         | 单元测试                                        |
| 游戏完成     | 闯关射击与僵尸大战可开始、暂停、结束、计分                                               | 手工体验 + 集成测试                             |
| 项目打磨完成 | 音效、粒子、主题均可用，CI 全绿                                                          | `npm run lint && npm run test && npm run build` |

### 13.2 风险控制

- **避免大重构**：每一块只改一个模块或新增一个模块；`main.ts` 的改动尽量延迟路由分支，不影响现有面板。
- **数据兼容**：`UserStorage` 原有字段保持不变，新增字段使用可选属性或默认值，避免老用户数据失效。
- **回滚策略**：每个功能块独立提交（commit），出现问题可单独回退。
- **性能保护**：新增对象（僵尸、目标、粒子）使用对象池；Canvas 渲染按层绘制，避免全屏重绘。
- **键盘覆盖**：`TypingEngine` 的字符事件须覆盖标准全尺寸键盘的字母、数字、符号与空格，功能键通过 `keydown` 处理。

---

## 14. 扩展游戏：坦克大战（Ctrl+5 新顶级面板）

> **状态：需求已敲定，尚未开始任何编码。本节为唯一有效口径。**
> 此前基于「打字是唯一交互 → 坦克不能动」推导出的「自动巡航 / 静止坦克 / 常驻护盾层数」方案已整体废弃，废弃原因见 §14.1。

### 14.1 定位与废弃方案记录

**定位**：`extra`（扩展游戏）面板的首个游戏，**原汁原味复刻 FC 坦克大战的灵魂**——地图与可破坏地形、大本营防守、敌方坦克 AI、双方炮弹对轰、我方坦克可自由移动。打字**退化为游戏属性之一**（承担开火与统计），不再是唯一交互；玩家的判断力用在走位、守家与目标优先级上。

**放弃舒尔特专注力训练**：与项目主线无关——格子里放单词后，盲打输入与既有「文章练习」的训练效果无实质区别，只是排版形态变化；且经典舒尔特依赖「注视点固定在格子中心 + 余光扫视搜索 + 瞬时指认」，输入全词必然使视线离开中心，本质退化为串行双任务，已偏离舒尔特本来意图。

**废弃方案与教训（必须记住，避免重犯）**：曾以「字母键全部归 `TypingEngine` 所有、WASD 与打字互斥」为由，推导出「坦克无法手动移动 → 自动巡航 → 最终静止」。**前提是错的**：`TypingEngine` 只分发字符 / 退格 / 提交 / Esc，**裸方向键 ↑↓←→ 完全空闲**（无任何业务语义，仅 Ctrl+方向键被游戏面板与训练面板占用，判 `!e.ctrlKey` 即可区分），原版方向键操作手感可直接照搬。同理，「炮弹对消」与「护盾」也不是本项目发明的差异化，而是**原版机制**（玩家子弹与敌方子弹相遇双双消失；Helmet 道具给临时无敌 + 出生保护）。
教训：把「某类按键已被占用」推广成「某种操作不可行」之前，必须先核对该类按键在输入层的**实际分发范围**，不能凭"字母键被占"就否掉整个移动系统。

### 14.2 战场与地形

- 战场 **13×13 格**（原版口径），坦克**半格对齐**移动（每格细分 2×2 子格），画布沿用扩展面板自有 canvas。
- 地形类型：`empty` 空地 / `brick` 砖墙（可破坏，**按四分之一格记录破坏状态**）/ `steel` 钢墙（仅火力 4 级可破）/ `water` 水面（坦克不可通行、**炮弹可飞越**）/ `base` 大本营（老鹰）/ `baseWall` 基地围墙砖块。
- **省略**草丛遮蔽与冰面打滑（超出核心复刻范围，留作后续扩展）。
- 地图为**手写固定关卡地图**：首批 5 张，10 关循环使用（难度靠敌坦克数量 / 速度 / 类型构成递增），数据集中在 `src/games/tank-maps.ts`。

### 14.3 关口递进设计原则（地图设计约束）

- **前几关**：地形收窄成**有限的窄关口**，玩家守在关口之后即可与敌坦克「遥遥相对火力对轰」通关，**无需跑图**——让新手靠打字就能过关。
- **后续关**：关口数量增加、地形逐步开放，需要走位与守家兼顾。
- 关口宽度必须 ≥ 坦克通行宽度；关口两侧必须存在对射视线（否则「遥遥对轰」不成立）。

### 14.4 地图可行性校验（不变量，必须单测）

纯函数 `validateTankMap(map)`，对**每一张**手写地图在单测中逐张断言通过：

1. 基地围墙初始**完整封闭**（`base` 四周被 `brick` / `baseWall` 包围）。
2. 玩家出生点为空地，且与基地区域**连通**。
3. 敌方 3 个出生点均为空地，且**初始状态下不存在直达基地的射击视线**（防开局偷家）。
4. 每个关口宽度 ≥ 坦克通行宽度（不存在坦克无法通过的缝隙）。
5. 关口两侧存在对射视线（保证「遥遥对轰」成立）。
6. 从敌方出生点到玩家 / 基地区域存在坦克可通行路径（**无死图**）。

新增或修改任何地图，必须同时通过该校验；校验器与地图数据同属一个模块，避免二者漂移。

### 14.5 我方坦克：移动与开火

**移动（全新输入通道）**

- **裸方向键 ↑↓←→ 持续移动**（按住即走），四方向、不可斜向（原版口径）。
- 需要新增「按住键状态集合」通道（`keydown` / `keyup` 维护 pressed set，在 `update(dt)` 内按方向推进）——`TypingEngine` 只提供离散字符事件，不提供持续状态。
- 必须 `preventDefault()` 防页面滚动；必须判 `!e.ctrlKey && !e.altKey && !e.shiftKey`，以与游戏面板的 Ctrl+←→↑↓ 调参、训练面板的 Ctrl+↑↓ 层级切换区分；**仅在扩展面板激活时生效**（面板门控）。

**开火（打字绑定）**

- **每输入一个字符发射一发炮弹**（含打错的哑弹），**不设在场数量上限、不设冷却**；密度靠对象池 + 炮弹寿命控制。
- **词长 = 该坦克血量**：每个正确字符炮弹造成 1 点伤害，输完该词即击毁。装甲坦克配长词、普通坦克配短词。血条**按层显示**（沿用僵尸大战「逐字符血条 + 扣血时 `shownChars` 归零」口径，避免破甲瞬间跳变）。
- **打错字符**：发射灰色哑弹（零伤害、不影响生存、不降火力），仅计入错误字符统计并重置当前单词进度——即「无惩罚，仅统计」，沿用僵尸大战 missed 哑弹的视觉语言（✗ 错字符飘字 + 跳弹 + 落地）。

**受击与重生**

- 玩家坦克被击中：损失 1 命，在出生点重生，**火力降回 1 级** + 短暂无敌保护；**3 条命**用尽即 GAME OVER。

### 14.6 目标锁定与 AI 威胁评估

- **黏性锁定（不变量）**：一旦玩家开始输入某敌坦克的词，锁定**粘住该坦克**直到词输完或该坦克死亡；AI **仅在玩家空闲**（无进行中输入）时重新选择目标。
  - 理由：「每字符一发」+「AI 自动锁定」若允许中途硬切换，会造成**当前单词永远打不完**，与项目历史上「含空格长句打不完」「波次静默死锁」属同一类结构缺陷。
- 威胁评分纯函数 `scoreTankThreat(enemy, ctx)`，优先级：**正在开火 / 炮弹已在途 > 距基地近 > 距玩家近 > 装甲类型（Armor 优先）**。
- AI 选中的目标身上显示单词，炮塔自动转向它，玩家无需瞄准。
- `expectedChar()` 按黏性锁定下标覆写，保证含空格短语可打完（基类双语义路由约定）。

### 14.7 敌方坦克与 AI

- 四类：**Basic**（短词、常速）/ **Fast**（短词、高速）/ **Power**（弹速快）/ **Armor**（长词、4 血、按剩余血量变色）。
- 每关 **10~12 辆**，同时在场最多 **3 辆**，顶部 **3 个出生点**轮流出场；闪烁红光的坦克被击毁后掉落道具。
- AI：**随机游走 + 偏向转向**（原版口径）——默认随机方向移动，按概率朝玩家或基地方向转向，随机开火；碰墙 / 碰地形则重新随机方向。**不做寻路**。

### 14.8 对轰与护盾

**对轰（原版机制）**

- 玩家炮弹与敌方炮弹相遇则**双双消失**，计入 `interceptions`，须有**粒子 + 飘字 + 音效**三重反馈。
- 两者常共线相向、相对速度为二者之和，碰撞判定必须用**「上一帧到本帧的线段扫过」**或按相对速度放大碰撞半径；单帧点距检测会**穿透漏判**，须用合成时间单测锁定该行为。

**护盾（原版口径）**

- **Helmet 道具触发的临时无敌** + **出生后短暂无敌保护**；**不是常驻护盾层数**（废弃方案的层数设计已弃用）。
- 无敌期间被击中无伤害，视觉为环绕闪烁环。

### 14.9 道具与火力成长

- 复刻四种道具：**Star**（火力升级）/ **Helmet**（临时无敌）/ **Shovel**（基地围墙临时变钢墙）/ **Tank**（加 1 命）。
- **火力等级由 Star 道具驱动**（1→4 级：弹速提升 → 双发 → 可破钢墙），**打字表现不参与升级**；玩家重生时降回 1 级。
- 暂不做 Clock（冻结）与 Grenade（全屏清敌）；冻结可复用僵尸大战已有的 `freezeUntil` 机制，留作后续扩展。

### 14.10 大本营、命数与关卡

- **基地被任一炮弹击中即 GAME OVER**（原版一击即毁，保留「一发入魂」的守家压力）。
- 玩家 **3 条命**，被击中扣 1 命 + 重生降级；命尽即 GAME OVER。
- 每关灭完全部敌坦克即过关；**累计通关 10 关判定胜利**并弹通关遮罩（沿用项目「关卡目标制、可通关才有正反馈」的既有决策）。
- 关卡推进判定必须挂在**每一条**会让敌坦克集合 / 出场队列变空的执行路径末尾（击毁、移除、超时等），避免「阶段推进只挂单一实体消失路径导致静默死锁」。

### 14.11 打字统计与结算

- **无惩罚但写回统计**：字符准确率、WPM、击毁数、对消数（`interceptions`）、通关关数、基地是否守住；沿用 `UserProgress.recordSession`，游戏模式标识 `'tank'`。
- 结算页展示上述指标；排行榜为该模式**单列**（成绩含义与掉落类不同）。
- 准确率按 `TankState.correctChars` 走 `computeAccuracy` 的精确分支（与 ShooterState 同口径），不在基类强加通用字段。

### 14.12 接入方案（面板 / 快捷键 / 输入隔离）

**新顶级面板**

- 面板 id `extra`，标题「扩展游戏」，位于排行榜之后，快捷键 **Ctrl+5**（`panelMap` 加 `'5': 'extra'`；Ctrl+数字命名空间已用 1~5，再追加须从 Ctrl+6 起）。
- Ctrl+5 会被浏览器用于切换标签页，须 `preventDefault() + stopPropagation()` 接管，与 Ctrl+1~4 同一模式。
- `index.html` 加 tab 按钮（含 `<kbd>Ctrl+5</kbd>` 标注）与 `<section id="panel-extra" class="panel">`；F1 帮助弹窗与 kbd 文案同步。

**面板内部游戏选择**

- 下拉 `#extra-game-mode`，当前仅 `'tank'` 一项，为后续扩展游戏预留；快捷键 Ctrl+Shift+1，判定用 `e.code === 'Digit1'`（布局无关，不用 `e.key`）。
- 与训练子标签、游戏面板 Ctrl+Shift+1/2/3 构成**第三处同名键**，必须四件套齐备：capture 阶段拦截 + `preventDefault()/stopPropagation()` + 当前面板激活门控（`isExtraPanelActive()`）+ 帮助文案标注归属面板。
- 下拉控件须套用 `suspend/disabled` 焦点保护（focus 时禁用隐藏输入框、blur 时恢复，重聚焦判断放进 `setTimeout` 回调内再检查控制标志）。

**输入与实例隔离**

- 使用**独立隐藏输入框** `#extra-game-input` 与**独立实例字段** `extraGame`，不复用游戏面板的 `#game-input` / `game` / `createGame`——否则两个面板的模式切换会走同一条重建路径互相干扰。
- `extraGame` 声明为**具体子类联合类型**（当前只有 `TankBattleGame`），不要抽成 `GameEngine<GameBaseState>` 基类引用（`onUpdate` 私有字段使泛型参数处于不变位，会报不可赋值）。
- `switchTab` 须扩成**三方焦点互斥**：切离训练面板 suspend `#train-input`、切离游戏面板 suspend `#game-input`、切离扩展面板 suspend `#extra-game-input`。
- `Enter`（开始）与 `Ctrl+P`（暂停）现有分支只判 `isGamePanelActive()`，须补扩展面板门控。
- 移动输入通道作为独立模块（`src/games/tank-controls.ts`）由 `main.ts` 分发：字符走 `TypingEngine`、方向键状态走该模块，仍遵循「输入集中、main.ts 协调」的不变量。

**设置持久化**

- 新键 `typeprime_extra_game_settings`（统一 `typeprime_` 前缀）；读写两侧都要做模式值合法性校验，否则刷新后会被判非法回落默认值。
- 词源类控件在扩展面板**不出现**（单词内容源为内置分档词表，见 §14.13）。

### 14.13 类型与模块清单

| 文件                            | 内容                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`             | 新增 `TankKind`、`TankTile`、`TankMap`、`EnemyTank`、`TankShell`、`TankItem`、`TankState extends GameBaseState`。**`TankShell` 独立于僵尸的 `Projectile`**（弹道语义不同：双方对撞抵消、碰撞半径可调），不复用既有类型。                                                                                                         |
| `src/games/tank-maps.ts`        | 手写地图数据（首批 5 张）+ `validateTankMap(map)` 可行性校验器 + 关口宽度 / 对射视线 / 连通性判定工具。                                                                                                                                                                                                                          |
| `src/games/tank-ai.ts`          | `scoreTankThreat(enemy, ctx)` 威胁评分 + 敌方随机游走与偏向转向决策 + 开火时机决策，全部做成纯函数（注入 rng 保证确定性），便于脱离 Canvas 单测。                                                                                                                                                                                |
| `src/games/tank-controls.ts`    | 方向键按住状态通道：pressed set 维护、面板门控、修饰键排除、`preventDefault` 防滚动。                                                                                                                                                                                                                                            |
| `src/games/tank-battle-game.ts` | `export class TankBattleGame extends GameEngine<TankState>`（构造签名对齐同族位置参数）+ `TANK_CONTENT` 分档词表（`letter`/`combo`/`simple`/`complex`/`phrase`/`boss`，**词长即血量**）+ 难度纯函数 `computeEnemySpeed` / `computeSpawnInterval` / `computeEnemyFireInterval` / `computeShellSpeed` / `computeInterceptRadius`。 |
| 四个同名 `.test.ts`             | 地图校验（全部地图逐张断言）、AI 评分与游走决策、移动通道、游戏主循环。测试子类放宽 `spawn` / `update` 可见性以驱动，rng 注入确定性。                                                                                                                                                                                            |
| `index.html`                    | 新 tab 按钮、`#panel-extra`、canvas、`#extra-game-mode`、`#extra-game-input`、kbd 标注、HUD（命数 / 火力等级 / 关卡 / 剩余敌坦克 / 对消数）。                                                                                                                                                                                    |
| `src/main.ts`                   | import、`extraGame` 字段、`panelMap` 加 `'5'`、`switchTab` 三方互斥、Ctrl+5 / Ctrl+Shift+1 / 方向键 / Enter / Ctrl+P 门控、设置读写与校验、统计接线。                                                                                                                                                                            |
| `style.css`                     | 沿用 CSS 变量与 `.panel` / `.tab-btn` / `.btn` 组件类，不引入新样式体系。                                                                                                                                                                                                                                                        |

**复用清单**：`GameEngine`（循环 / 暂停 / `layers` + `beginFrame(paintStatic?)` 分层渲染 / `handleChar` / `handleBackspace` / `submitWord` / `expectedChar`）、`lengthSpeedFactor`（敌坦克推进速度按词长补偿）、`sound-manager`（GameSfx 钩子新增 `fire` / `hit` / `intercept` / `shieldOn` / `destroy` / `item` / `baseLost`；开关切换不得重建实例）、`particle-system`（对轰爆炸、砖墙碎屑、破墙、道具拾取）、`theme`（`getPalette()` 调色板）。

**帧内计时约束**：`update(now)` 驱动的所有实体时间戳、dt 计算、TTL 比较一律使用注入的 `now` 并缓存为 `frameNow`，禁止混用 `performance.now()`；dt 哨兵初值必须是 `-1`；`onResume` 须重置 `lastUpdateAt`，否则暂停恢复后大 dt 造成坦克与炮弹瞬移。

### 14.14 实施阶段划分

1. **地图与地形层**：`types.ts` 扩展 + `tank-maps.ts` 地图数据 + `validateTankMap` + 单测（不接 UI）。
2. **移动与碰撞**：`tank-controls.ts` + 坦克半格对齐移动 + 地形阻挡（砖 / 钢 / 水）+ 砖墙按四分之一格破坏 + 静态层失效。
3. **敌方与对轰**：敌坦克生成 / 随机游走 AI / 开火 + 炮弹飞行 + **双方炮弹对撞抵消** + 基地被击判定。
4. **打字与火力**：黏性锁定 + 威胁评分 + 每字符一发炮弹 + 词长即血量 + 哑弹 + Star 升级 / 破钢墙。
5. **道具与关卡**：四种道具 + 3 命与重生降级 + 10 关胜利 + 结算页。
6. **面板接入**：Ctrl+5 tab + 独立隐藏输入框 + 下拉与 Ctrl+Shift+1 + 三方焦点互斥 + 统计与持久化。
7. **收尾**：文档同步（PLAN / PROGRESS / README）→ `npm run format` → `lint && test && build` → 本地 no-store 服务器浏览器验证。

### 14.15 风险控制与已知陷阱

- **方向键与既有快捷键冲突**：必须判修饰键（`!e.ctrlKey && !e.altKey && !e.shiftKey`）+ 扩展面板激活门控 + `preventDefault()` 防页面滚动。
- **焦点互抢**：独立输入框 + `suspend/disabled` 保护 + `disabled` 阻断程序化聚焦（disabled 元素无法被聚焦，是切断 focus/blur 死循环的关键手段）。
- **黏性锁定必须落实**：否则「每字符一发 + 自动锁定」会造成单词永远打不完（历史同类缺陷：含空格长句打不完、波次静默死锁）。
- **对轰高速穿透**：炮弹相向而行相对速度大，单帧点距检测漏判；必须用线段扫过判定或按相对速度放大半径，并用合成时间单测锁定。
- **关卡推进静默死锁**：推进判定须挂在每一条会让敌坦克集合 / 队列变空的路径末尾。
- **性能**：炮弹无上限 + 每字符一发 + 13×13 地形 → 炮弹与砖墙碎屑必须走对象池；**砖墙破坏会改变静态层内容，须触发分层渲染缓存 invalidate**（`beginFrame` 指纹只认 palette 引用，地形变化需显式 `redraw()`）。
- **地图死图 / 开局偷家**：`validateTankMap` 六项校验必须覆盖全部地图并作为 CI 断言，新增地图不得跳过。
- **打字被稀释**：本模式打字权重低于既有三模式，须保证结算页与排行榜仍呈现准确率 / WPM，否则 `extra` 面板与「打字基本法」主线脱节。
- **Windows CRLF**：新建文件后先 `npm run format` 再跑 lint/test，避免 prettier 大量报错。
- **文档滞后**：交付后须对 PLAN.md / PROGRESS.md / README.md 全量核对新面板、快捷键与项目结构口径，不能只改单节就宣称已对齐。
