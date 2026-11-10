# 打字基本法（Type Prime）项目进度与需求记录

## 1. 项目概述

打字基本法（Type Prime，仓库标识 `type-prime`）是一个基于 TypeScript + HTML5 Canvas 的浏览器端指法训练项目。核心目标是通过标准指法输入完成键位训练、单词/文章练习、记忆曲线复习以及两款指法游戏（闯关射击、僵尸大战）。

- 技术栈：TypeScript 5.4、`tsc` 编译、ESNext 模块、原生 HTML/CSS/Canvas 2D、Vitest + jsdom、ESLint + Prettier。
- 完整实施计划见 [`PLAN.md`](./PLAN.md)。
- 本文档记录当前进展、用户需求细节与下一步计划，确保后续工作可无缝衔接。

---

## 2. 第一阶段开发进展（已完成）

第一阶段目标：搭建统一输入与数据底座，实现 `TypingEngine`、`VocabularyBank`、`ReviewScheduler` 与 `UserProgress`。

### 2.1 已完成的模块与文件

| 模块         | 文件                                | 说明                                                                                                                                                          |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 类型定义     | `src/types.ts`                      | 新增 `WordEntry`、`VocabularyCategory`、`ReviewState`、`TypingEvent`、`KeyStats`、`WordStats`、`TrainingSession`、`GameSession`、`UserProgressData` 等类型。  |
| 统一输入引擎 | `src/input.ts`                      | `TypingEngine` 统一监听 `input`/`keydown`，分发 `char`/`backspace`/`submit`/`escape` 事件；覆盖字母、数字、符号、空格等完整打字机键位，并兼容中文输入法 IME。 |
| 词库管理     | `src/vocabulary.ts`                 | `VocabularyBank` 支持分类、难度查询、CRUD、导入导出、JSON 持久化。                                                                                            |
| 默认词库     | `src/assets/vocab/default-words.ts` | 内置 `daily`（日常英语）与 `programming`（编程术语）两组默认词库。                                                                                            |
| 复习调度     | `src/review.ts`                     | `ReviewScheduler` 基于 SM-2 间隔重复算法，提供 `recordResult`、`getDueReviews`、导入导出。                                                                    |
| 用户进度     | `src/storage.ts`                    | 由 `UserStorage` 升级为 `UserProgress`，兼容旧数据，新增 `keyStats`、`wordStats`、`sessions` 及记录方法。                                                     |
| 入口协调     | `src/main.ts`                       | 已同步改用 `UserProgress`，现有“单词掉落”游戏与基础指法训练保持可用。                                                                                         |

### 2.2 测试与构建

- 新增/扩展单元测试：
  - `src/input.test.ts`（7 个测试）
  - `src/vocabulary.test.ts`（9 个测试）
  - `src/review.test.ts`（5 个测试）
  - `src/storage.test.ts`（原有 4 个 + 新增 3 个）
- 验证结果：
  - `npm run lint`：通过
  - `npm run test`：28 个测试全部通过
  - `npm run build`：通过

### 2.3 提交记录

- Commit：`6216401` — `feat(phase-1): add TypingEngine, VocabularyBank, ReviewScheduler and UserProgress`

---

## 3. 用户需求详细记录

用户需求由口头描述整理而来，整体分为三大块：指法训练、单词/文章输入与词库记忆、指法游戏（闯关射击 + 僵尸大战）。以下按块记录。

### 3.1 指法训练模块

指法训练是用户最关心的基础部分，明确需求包括：

1. **分层训练**
   - 支持从单键、单字母、字母组合、单词到短语的逐级训练。
   - 可按照难度（初级 / 中级 / 高级）或键位区域（左手 / 右手 / 基准键位）组织练习内容。
   - 系统可针对用户薄弱环节自动推荐练习键位或单词。

2. **键盘布局显示**
   - 屏幕上显示标准键盘布局（QWERTY）。
   - 用户按键时实时高亮对应键位，并提示应使用的左右手与手指。
   - 练习过程中提示“下一个应输入键”，帮助用户提前准备指法。
   - 键盘输入范围须统一覆盖标准全尺寸键盘的字母、数字、符号与功能键。

3. **标准文本与用户输入对比**
   - 预设或导入的标准文本（单词、文章）作为参考。
   - 用户输入内容与标准文本逐字符对比。
   - 已正确输入部分与待输入部分使用不同颜色/样式区分显示。
   - 实时统计 WPM（每分钟单词数）、CPM（每分钟字符数）、准确率、用时。

4. **错误标记与纠正**
   - 输入错误时立即给出视觉提示（如红色闪烁、错误计数 +1）。
   - 记录每个键位、每个单词的错误次数，生成错误热力图或易错词列表。
   - 对错误键位/单词进行重复提示与强化练习。
   - 支持 Backspace 回退当前输入进度。

### 3.2 单词/文章输入与词库记忆模块

- 练习内容来自词库，词库分类包括：中小学课文词库、大学四六级词库、编程术语、日常英语、自定义词库等。
- 单词的记忆通过“用指法输入单词”完成，系统记录每次输入结果。
- 基于记忆曲线（遗忘曲线 / SM-2）管理复习计划，每日生成“今日复习”队列。
- 支持词库导入导出、分类管理、掌握度可视化。

### 3.3 指法游戏模块

闯关射击与僵尸大战同属指法游戏类，不是两个并列阶段。

#### 闯关射击

- 不是单纯的“单字母射击游戏”，而是从单字母起步，逐步过渡到双字母、简单单词、复杂单词、短语的逐级闯关射击玩法。
- 目标携带待输入内容，用户输入正确即发射子弹击毁目标。
- 包含连击、关卡推进、BOSS 战、得分结算等机制。
- 文件/类名：`TypingShooterGame` / `src/typing-shooter-game.ts`。

#### 僵尸大战

- 僵尸身上挂字母或单词，玩家通过指法输入正确内容消灭僵尸。
- 僵尸向玩家/基地移动，到达后扣除血量或“感染”玩家。
- 包含波次系统、多种僵尸类型（普通、快速、坦克、BOSS）、道具、基地血量与游戏结束判定。
- 文件/类名：`ZombieTypingGame` / `src/zombie-typing-game.ts`。

### 3.5 通用要求

- 新功能在现有架构基础上增量扩展，不推翻重来。
- 保持现有“单词掉落”游戏与基础指法训练可用。
- 所有新增代码通过 ESLint、Prettier、Vitest 与 GitHub Actions CI。
- 细部需求（如具体 UI 样式、音效、动画细节）后续再逐条沟通。

---

## 4. 块一：指法训练与输入练习（已完成）

块一已交付并通过本地验证（`npm run lint && npm test && npm run build` 全绿）：

- `src/train-engine.ts`：`TRAINING_LEVELS` 8 层级 + 三阶段（单键重复 / 双键组合 / 随机混合）序列生成，逐字符比对与 WPM/CPM/准确率统计。
- `src/train-panel.ts`：`TrainPanel` 控制器 + `MiniKeyboardCanvas` 缩略键盘 + `MiniHandsDiagram` 手指示意；键位 / 单词 / 文章三种练习模式；双行对照逐字符着色纠错；下一键预判高亮；结果弹窗；长文视窗滚动跟随。
- `src/keyboard.ts`：DOM 键盘新增 `hintNext/clearHint/highlightLayer/clearLayer/pressKey`，并区分左右手底色与手指高亮。
- `src/main.ts`：集成 `TypingEngine` + `TrainPanel`，全键盘快捷键（`Ctrl+1/2/3/4` 面板、`Ctrl+Shift+1/2/3` 子标签、`Ctrl+↑↓` 层级、`Ctrl+←/→` 阶段、`F1` 帮助、`Enter`/`Esc` 等）。

---

## 5. 块二：单词记忆与词库管理（已完成）

块二已交付并通过本地验证（6 个测试文件、73 个用例全部通过）：

- `src/vocab-panel.ts`（新增）：`VocabPanel` 词库管理面板控制器，通过 deps 注入消费 `VocabularyBank` / `ReviewScheduler` / `UserProgress`。
  - 分类筛选、搜索、单词列表（单词 / 释义 / 分类 / 难度 / 掌握度徽章 / 下次复习 / 操作）。
  - 单词添加 / 编辑 / 删除（表单 + 行内按钮）。
  - 词库 JSON 导入 / 导出。
  - 「今日复习」入口：取 `ReviewScheduler` 到期队列并回调 `main.ts` 切换到训练面板开始复习练习。
- `src/train-panel.ts`：新增 `startReview(wordIds)` 复习练习模式；单词 / 复习练习完成后按单词粒度回写 `UserProgress.recordWordResult` 与 `ReviewScheduler.recordResult`，形成记忆曲线闭环。
- `src/review.ts`：修复 `nextState` 丢失 `wordId` 的问题；新增 `getDueCount()`。
- `src/main.ts`：接线 `ReviewScheduler` 与 `VocabPanel`，新增「词库」面板路由（`Ctrl+3`），排行榜顺延为 `Ctrl+4`；用户切换时刷新词库面板。
- `index.html` / `style.css`：新增 `#panel-vocab` 结构、词库 tab、帮助与底部快捷键提示；掌握度徽章与词库面板样式。
- `src/vocab-panel.test.ts`（新增）：9 个用例覆盖渲染、分类 / 搜索过滤、增删、复习计数与回调、掌握度徽章。

### 5.1 验收标准（已达成）

- [x] 词库面板可分类筛选、搜索、增删改单词并导入导出 JSON。
- [x] 掌握度（未学 / 学习中 / 复习中 / 已掌握）可视化。
- [x] 「今日复习」按 SM-2 到期队列生成并可一键开始复习练习。
- [x] 单词 / 复习练习完成后回写掌握度与复习间隔，形成记忆闭环。
- [x] `npm run lint && npm test && npm run build` 全绿。

---

## 6. 后续计划：块三（指法游戏）

下一步实现第三块「指法游戏」（闯关射击 + 僵尸大战，二者同属游戏类），具体任务：

1. ✅ 新建 `src/game-engine.ts`：提取通用游戏循环、状态管理、暂停 / 恢复与 `TypingEngine` 输入接入。
2. ✅ 新建 `src/typing-shooter-game.ts`（`TypingShooterGame`）：目标从单字母 → 字母组合 → 单词 → 短语逐级；连击、关卡推进、BOSS、结算页。
3. ✅ 新建 `src/zombie-typing-game.ts`（`ZombieTypingGame`）：波次系统、基地血量、普通 / 快速 / 坦克 / BOSS 僵尸、道具、结算页；复用 `FallingWordGame` 的目标锁定与单词进度逻辑。
4. ⬜ 僵尸造型改进（用户手动测试后反馈：当前僵尸仅为色块方框，不够形象）：在 `src/zombie-typing-game.ts` 的 `draw()` 中为四类僵尸绘制可辨识的造型（头/躯干/手臂/腿部轮廓或简笔精灵），普通/快速/坦克/BOSS 在体型、配色、细节上有明显区分；行走时可加轻微摆动/步态动画；保持 Canvas 2D 纯绘制、不引入图片资源与额外依赖；造型不得遮挡携带单词与血条的显示。
5. ⬜ 表现层打磨：`src/sound-manager.ts`、`src/particle-system.ts`、主题与 Canvas 分层渲染。
6. ⬜ 测试：游戏引擎状态机、输入匹配、关卡 / 波次与结算测试。

---

## 7. 当前阻塞与注意事项

- 无阻塞项。
- 内置词库目前仅 `daily` / `programming` 两组默认词库；PLAN.md 第 11 节规划的中小学、四六级等词库 JSON 尚未落地，后续按版权合规要求补充。
- 细部 UI/交互（配色、动画时长、音效）仍可据用户反馈微调。
