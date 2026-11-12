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

1. 扩展类型定义（`src/types.ts`）
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
- **Canvas 渲染分层**：背景、僵尸/目标、粒子、UI 分层绘制，避免一帧内重复清除。
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

## 7. 预期新增/调整的文件结构

```
type-prime/
├── PLAN.md                       # 本文档
├── README.md
├── src/
│   ├── types.ts                  # 扩展 WordEntry、Category、ReviewState 等类型
│   ├── storage.ts                # 扩展为 UserProgress
│   ├── storage.test.ts           # 补充用户进度/词库测试
│   ├── keyboard.ts               # 重构键盘渲染与动画
│   ├── input.ts                  # 新增 TypingEngine 统一输入
│   ├── vocabulary.ts             # 新增 VocabularyBank
│   ├── review.ts                 # 新增 ReviewScheduler
│   ├── train-engine.ts           # 新增指法练习引擎
│   ├── game-engine.ts            # 新增游戏公共基类
│   ├── falling-word-game.ts      # 由原 game.ts 迁移/保留
│   ├── typing-shooter-game.ts    # 新增
│   ├── zombie-typing-game.ts     # 新增
│   ├── particle-system.ts        # 新增
│   ├── sound-manager.ts          # 新增
│   ├── main.ts                   # 调整：按面板路由事件
│   └── assets/
│       ├── vocab/                # 词库 JSON
│       └── sounds/               # 音效文件
├── index.html                    # 增加训练/词库/游戏选择面板
├── style.css                     # 增加动画与游戏面板样式
└── tests/                        # 可选：补充集成测试
```

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

- 扩展 `src/keyboard.ts`：为键位添加 CSS 按下/弹起动画。
- 新增 `hintNext(code)` 方法，在练习中高亮“下一个应输入键”。
- 保持现有 `highlight(code)` 与手指图高亮能力不变。

#### 2. 练习引擎（`src/train-engine.ts`）

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
- 生成错误键位热力图与易错词列表。

#### 6. 测试

- `TrainEngine` 序列生成、正误判定、事件派发测试。
- 键盘 `hintNext` 与动画测试。

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

- 新建 `src/game-engine.ts`：统一生命周期、状态管理、暂停/恢复、输入接入。

#### 2. 闯关射击（`src/typing-shooter-game.ts`）

- 目标生成：单字母 → 字母组合 → 单词 → 短语，难度递增。
- 输入匹配：单字母即时击毁，单词/组合可逐字符锁定。
- 连击、关卡推进、BOSS 关卡、结果页。

#### 3. 僵尸大战（`src/zombie-typing-game.ts`）

- 僵尸对象、波次系统、基地血量。
- 输入锁定与冲突处理。
- 普通/快速/坦克/BOSS 僵尸、道具、结果页。
- 僵尸造型改进（用户手动测试后追加）：`draw()` 中为四类僵尸绘制可辨识造型（头/躯干/手臂/腿部轮廓或简笔精灵），体型、配色、细节明显区分，行走可加轻微摆动/步态动画；纯 Canvas 2D 绘制、不引入图片资源与额外依赖，造型不得遮挡携带单词与血条。

#### 4. 表现层打磨

- 音效系统 `src/sound-manager.ts`。
- 粒子系统 `src/particle-system.ts`。
- 主题切换、键盘动画、Canvas 分层渲染。
- 可选 WebGL/PixiJS 评估。

#### 5. 测试

- 游戏引擎状态机测试。
- 闯关射击与僵尸大战的输入匹配、关卡/波次、结算测试。

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

词库以 JSON 文件形式存放在 `src/assets/vocab/` 目录，便于版本管理与按需加载。

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
  - `src/types.ts`：集中类型定义。
  - `src/storage.ts`：`UserStorage` 类。
  - `src/keyboard.ts`：`KeyboardRenderer` 负责虚拟键盘与手指图渲染。
  - `src/game.ts`：`FallingWordGame` 负责 Canvas 单词掉落游戏。
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
   - 继续在 `src/types.ts` 中集中新增类型。
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

- 扩展 `src/keyboard.ts`：新增 `hintNext(code)` 与按键动画，不改动现有 `highlight(code)` 行为。
- 新增 `src/train-engine.ts`：生成练习序列并校验输入。
- 扩展 `index.html`：在“指法训练”面板内增加子标签页（自由/键位/文章）。
- 扩展 `src/main.ts`：在训练面板激活时，将 `TypingEngine` 事件路由到 `TrainEngine`。

### 块二：单词记忆与词库管理

- 完善 `src/vocabulary.ts` 与词库管理 UI。
- 在 `src/review.ts` 中完善 `getDueReviews()` 与 `recordResult()`。
- 扩展 `src/main.ts` 与 `index.html`：新增“今日复习”入口。
- 让 `TrainEngine` 支持从 `ReviewScheduler` 取词生成复习练习。

### 块三：指法游戏

- 新增 `src/game-engine.ts`：提取通用游戏循环与状态管理。
- 新增 `src/typing-shooter-game.ts`：继承 `GameEngine`，复用 `TypingEngine` 输入。
- 新增 `src/zombie-typing-game.ts`：继承 `GameEngine`。
- 复用 `FallingWordGame` 的目标锁定与单词进度逻辑，迁移到基类或作为工具函数复用。
- 扩展 `index.html` 与 `src/main.ts`：接入游戏选择。
- 新增 `src/sound-manager.ts`、`src/particle-system.ts`，在 `GameEngine` 中预留钩子。

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
