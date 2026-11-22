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

| 模块         | 文件                                      | 说明                                                                                                                                                          |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 类型定义     | `src/core/types.ts`                       | 新增 `WordEntry`、`VocabularyCategory`、`ReviewState`、`TypingEvent`、`KeyStats`、`WordStats`、`TrainingSession`、`GameSession`、`UserProgressData` 等类型。  |
| 统一输入引擎 | `src/core/input.ts`                       | `TypingEngine` 统一监听 `input`/`keydown`，分发 `char`/`backspace`/`submit`/`escape` 事件；覆盖字母、数字、符号、空格等完整打字机键位，并兼容中文输入法 IME。 |
| 词库管理     | `src/vocab/vocabulary.ts`                 | `VocabularyBank` 支持分类、难度查询、CRUD、导入导出、JSON 持久化。                                                                                            |
| 默认词库     | `src/vocab/assets/vocab/default-words.ts` | 内置 `daily`（日常英语）与 `programming`（编程术语）两组默认词库。                                                                                            |
| 复习调度     | `src/vocab/review.ts`                     | `ReviewScheduler` 基于 SM-2 间隔重复算法，提供 `recordResult`、`getDueReviews`、导入导出。                                                                    |
| 用户进度     | `src/core/storage.ts`                     | 由 `UserStorage` 升级为 `UserProgress`，兼容旧数据，新增 `keyStats`、`wordStats`、`sessions` 及记录方法。                                                     |
| 入口协调     | `src/main.ts`                             | 已同步改用 `UserProgress`，现有“单词掉落”游戏与基础指法训练保持可用。                                                                                         |

### 2.2 测试与构建

- 新增/扩展单元测试：
  - `src/core/input.test.ts`（7 个测试）
  - `src/vocab/vocabulary.test.ts`（9 个测试）
  - `src/vocab/review.test.ts`（5 个测试）
  - `src/core/storage.test.ts`（原有 4 个 + 新增 3 个）
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
- 文件/类名：`TypingShooterGame` / `src/games/typing-shooter-game.ts`。

#### 僵尸大战

- 僵尸身上挂字母或单词，玩家通过指法输入正确内容消灭僵尸。
- 僵尸向玩家/基地移动，到达后扣除血量或“感染”玩家。
- 包含波次系统、多种僵尸类型（普通、快速、坦克、BOSS）、道具、基地血量与游戏结束判定。
- 文件/类名：`ZombieTypingGame` / `src/games/zombie-typing-game.ts`。

### 3.5 通用要求

- 新功能在现有架构基础上增量扩展，不推翻重来。
- 保持现有“单词掉落”游戏与基础指法训练可用。
- 所有新增代码通过 ESLint、Prettier、Vitest 与 GitHub Actions CI。
- 细部需求（如具体 UI 样式、音效、动画细节）后续再逐条沟通。

---

## 4. 块一：指法训练与输入练习（已完成）

块一已交付并通过本地验证（`npm run lint && npm test && npm run build` 全绿）：

- `src/train/train-engine.ts`：`TRAINING_LEVELS` 8 层级 + 三阶段（单键重复 / 双键组合 / 随机混合）序列生成，逐字符比对与 WPM/CPM/准确率统计。
- `src/train/train-panel.ts`：`TrainPanel` 控制器 + `MiniKeyboardCanvas` 缩略键盘 + `MiniHandsDiagram` 手指示意；键位 / 单词 / 文章三种练习模式；双行对照逐字符着色纠错；下一键预判高亮；结果弹窗；长文视窗滚动跟随。
- `src/train/keyboard.ts`：DOM 键盘新增 `hintNext/clearHint/highlightLayer/clearLayer/pressKey`，并区分左右手底色与手指高亮。
- `src/main.ts`：集成 `TypingEngine` + `TrainPanel`，全键盘快捷键（`Ctrl+1/2/3/4` 面板、`Ctrl+Shift+1/2/3` 子标签、`Ctrl+↑↓` 层级、`Ctrl+←/→` 阶段、`F1` 帮助、`Enter`/`Esc` 等）。

---

## 5. 块二：单词记忆与词库管理（已完成）

块二已交付并通过本地验证（6 个测试文件、73 个用例全部通过）：

- `src/vocab/vocab-panel.ts`（新增）：`VocabPanel` 词库管理面板控制器，通过 deps 注入消费 `VocabularyBank` / `ReviewScheduler` / `UserProgress`。
  - 分类筛选、搜索、单词列表（单词 / 释义 / 分类 / 难度 / 掌握度徽章 / 下次复习 / 操作）。
  - 单词添加 / 编辑 / 删除（表单 + 行内按钮）。
  - 词库 JSON 导入 / 导出。
  - 「今日复习」入口：取 `ReviewScheduler` 到期队列并回调 `main.ts` 切换到训练面板开始复习练习。
- `src/train/train-panel.ts`：新增 `startReview(wordIds)` 复习练习模式；单词 / 复习练习完成后按单词粒度回写 `UserProgress.recordWordResult` 与 `ReviewScheduler.recordResult`，形成记忆曲线闭环。
- `src/vocab/review.ts`：修复 `nextState` 丢失 `wordId` 的问题；新增 `getDueCount()`。
- `src/main.ts`：接线 `ReviewScheduler` 与 `VocabPanel`，新增「词库」面板路由（`Ctrl+3`），排行榜顺延为 `Ctrl+4`；用户切换时刷新词库面板。
- `index.html` / `style.css`：新增 `#panel-vocab` 结构、词库 tab、帮助与底部快捷键提示；掌握度徽章与词库面板样式。
- `src/vocab/vocab-panel.test.ts`（新增）：9 个用例覆盖渲染、分类 / 搜索过滤、增删、复习计数与回调、掌握度徽章。

### 5.1 验收标准（已达成）

- [x] 词库面板可分类筛选、搜索、增删改单词并导入导出 JSON。
- [x] 掌握度（未学 / 学习中 / 复习中 / 已掌握）可视化。
- [x] 「今日复习」按 SM-2 到期队列生成并可一键开始复习练习。
- [x] 单词 / 复习练习完成后回写掌握度与复习间隔，形成记忆闭环。
- [x] `npm run lint && npm test && npm run build` 全绿。

---

## 6. 后续计划：块三（指法游戏）

下一步实现第三块「指法游戏」（闯关射击 + 僵尸大战，二者同属游戏类），具体任务：

1. ✅ 新建 `src/games/game-engine.ts`：提取通用游戏循环、状态管理、暂停 / 恢复与 `TypingEngine` 输入接入。
2. ✅ 新建 `src/games/typing-shooter-game.ts`（`TypingShooterGame`）：目标从单字母 → 字母组合 → 单词 → 短语逐级；连击、关卡推进、BOSS、结算页。
3. ✅ 新建 `src/games/zombie-typing-game.ts`（`ZombieTypingGame`）：波次系统、基地血量、普通 / 快速 / 坦克 / BOSS 僵尸、道具、结算页；复用 `FallingWordGame` 的目标锁定与单词进度逻辑。
4. ✅ 僵尸造型改进（用户手动测试后反馈：当前僵尸仅为色块方框，不够形象）：在 `src/games/zombie-typing-game.ts` 的 `draw()` 中为四类僵尸绘制可辨识的造型（头/躯干/手臂/腿部轮廓或简笔精灵），普通/快速/坦克/BOSS 在体型、配色、细节上有明显区分；行走时可加轻微摆动/步态动画；保持 Canvas 2D 纯绘制、不引入图片资源与额外依赖；造型不得遮挡携带单词与血条的显示。
5. 🔶 表现层打磨（部分完成）：
   - ✅ 音效系统 `src/games/sound-manager.ts`：WebAudio 实时合成（无音频文件、无新依赖），音色抽为纯数据表 `SFX_SPECS`；三个游戏模式统一通过 `onSfx` 钩子报事件（单词掉落 key/error/destroy/levelup/hurt/gameover；闯关射击 shoot/error/hit/destroy/levelup/hurt/boss/gameover；僵尸大战沿用 shoot/hit/kill/miss/miss-hit/splat 并补 hurt/heal/levelup/gameover）；设置行新增「音效」开关 + `Ctrl+Shift+5`，持久化到 `typeprime_game_settings.sound` 且不重建游戏实例，关闭后完全静音；AudioContext 懒创建/自动 resume 绕过自动播放策略，不支持时降级 no-op；同名音效 30ms 节流防削波。浏览器实测三模式发声、关闭静音、刷新持久化、控制台零报错。详见 PLAN.md §10.4.1。
   - ✅ 粒子系统 `src/render/particle-system.ts`：轻量粒子池 + 纯 Canvas 2D 绘制（零资源零依赖），预设表 `PARTICLE_PRESETS` 覆盖 hit/kill/destroy/splat/hurt/heal/levelup/boss 八类事件，四种形状（dot/spark/smoke/ring）；粒子只按注入 dt 推进（单帧步长上限 50ms、池上限 400、寿命淡出），不进 state 以免污染 onUpdate；三个模式在击杀/击毁/命中/破甲/落地/触底/升关/BOSS 登场处发射，装饰性 emoji 飘字（💥/✦/💨/🥀）已由粒子取代，带信息量的文案飘字（🔧/❄/+50/✗错字符）保留；基类新增 `onReset()` 钩子负责 reset 清池。测试基线 15 文件 193 用例全绿（含 particle-system.test.ts 23 例）；浏览器用「全项目仅粒子系统写 ctx.globalAlpha」做写入计数探针，实测三模式粒子渲染、装饰 emoji 归零、控制台零报错。详见 PLAN.md §10.4.2。
   - ✅ 主题切换 `src/render/theme.ts`：三主题（深空夜 night 默认 / 纸墨白 paper / 磷光绿 phosphor），顶栏「主题」下拉 + 全局 `Ctrl+Shift+6` 循环；双源配色各自单一来源（DOM 走 style.css 的 html[data-theme] 变量块，Canvas 走 THEMES[name].canvas 的 17 个 token），世界色（僵尸/植物/炮弹/粒子/手指/BOSS/冻结）不随主题变；`GameEngineOptions.getPalette` 注入活取色函数 + 基类/TrainPanel `redraw()`，切主题不重建实例不打断当前局；存储键 `typeprime_theme`，index.html 内联脚本首屏防闪烁；主题下拉做训练/游戏双套焦点保护。顺手修复强调色按钮内 kbd 对比不足与窄视口层级提示被挤压。测试基线 16 文件 218 用例全绿（theme.test.ts 22 例 + train-panel 补 3 例）；浏览器实测三主题 DOM/Canvas 逐色核对、三模式可玩、快捷键循环、刷新持久化、控制台零报错。详见 PLAN.md §10.4.3。
   - ✅ 键盘动画 `src/train/keyboard-anim.ts`：`KeyboardAnimator` 纯数值状态机（press 下压回弹 / error 横向抖动 / hint 呼吸 / layer 逐键渐入 / ripple 涟漪 + idle 呼吸）与 `MiniKeyboardCanvas` 绘制分离，只按注入时间戳推进（首帧 dt 哨兵、单帧步长上限 50ms），`active` 为假时 rAF 自然停；键座/键帽双层绘制，实色底字色切 onAccent 保三主题可读；切面板/完成/destroy 起停不叠循环；系统 prefers-reduced-motion 与用户开关共用 reduced 降级通道，DOM 手指图示同步 `.mini-hands--static`；「动画：开/关」按钮 + `Ctrl+Shift+7`，持久化 `typeprime_train_settings.motion`。顺手修复完成态回退再输入的 insertBefore 崩溃与文章加载残留提示文案两个既有缺陷。测试基线 17 文件 282 用例全绿（keyboard-anim 47 + 训练面板动画 15 + 回归 2）；浏览器 no-store 服务器实测按下/错键/hint 帧视觉、切面板绘制数 0/恢复、开关与持久化、控制台零报错。详见 PLAN.md §10.4.4。
   - ✅ Canvas 分层渲染 `src/render/layered-canvas.ts` + src 目录模块化重构：单主画布 + 离屏静态缓存（非多 canvas DOM 堆叠），`beginFrame(key, paintStatic)` 以版面色对象引用为指纹，invalidate/指纹/尺寸三要素失效，离屏不可用时降级直绘；`GameEngine` 新增 `layers` 与 `beginFrame()`，三个游戏拆出 `drawBackground`（网格/基地线入静态层），实体→粒子→遮罩/HUD 有序动态 passes；缩略键盘板面/键座入静态缓存，呼吸帧只 blit。同期把 src 平铺文件按模块 git mv 进 core/render/train/games/vocab 子目录（测试同目录并存，assets 归 vocab），全量 import 修正，配置全 glob 无需改动（结构详见 PLAN.md §7）。测试基线 18 文件 293 用例全绿（layered-canvas 9 + train-panel 分层 2）；jsdom 噪声改由 vitest.setup.ts 在 worker 内过滤（VirtualConsole 无法序列化进 forks worker；错误分析批次后改为原型级 getContext 返回 null 的源头静音，见任务 10）；浏览器 no-store 实测游戏每帧 drawImage 1 次、stroke 40+/帧→1–3/帧、三模式可玩、三主题即时重绘、切面板停/恢复、控制台零报错。详见 PLAN.md §10.4.5。
   - ⬜ WebGL/PixiJS 评估。
6. ✅ 测试：游戏引擎状态机、输入匹配、关卡 / 波次与结算测试（随任务 1–4、8、9 逐步补齐，已核对覆盖面）：
   - 状态机：`src/games/game-engine.test.ts` —— start 倒计时与输入门控、pause/resume、reset、attachInput 路由、gameOver 回调、`lengthSpeedFactor` 边界、基类 `expectedChar` 默认值。
   - 输入匹配与关卡/波次：`src/games/game.test.ts`（难度纯函数 + 起始等级接线）、`src/games/typing-shooter-game.test.ts`（内容分级、出怪间隔、连击/失误/Backspace、BOSS 三轮与升关、触底扣命与结算、长句减速与空格）、`src/games/zombie-typing-game.test.ts`（波次构成、出怪间隔与速度、普通/坦克击杀、触底扣血、双入口波次推进、道具回补、坚守 8 波结算、打击反馈与哑弹）。
   - 基线：18 个测试文件共 293 用例全绿（音效 +23、粒子 +35、主题 +25、键盘动画 +64、分层渲染 +11 后），`npm run build` / `lint` / `format:check` 同步通过，`build:release` 183.6 KB。
7. ✅ 游戏面板设置全键盘化：`Ctrl+Shift+1/2/3` 切换模式、`Ctrl+↑/↓` 起始等级(1–10循环)、`Ctrl+←/→` 速度倍率(0.5/0.75/1/1.5/2循环)、`Ctrl+Shift+4` 切换词源(仅单词掉落，其余模式为提示型 no-op)；仅游戏面板激活生效，走 handleGameSettingChange 重建实例，触发后在设置行闪现当前值 1.5s 并同步 kbd 标注/F1 帮助弹窗/底部提示栏。模式与词源用 `e.code` 判定避开 Shift 布局差异。已经浏览器实测全部生效且与训练面板同名快捷键互不干扰。详细设计见 PLAN.md §10.6。
8. ✅ 僵尸大战打击反馈增强：全僵尸头部血条(按层显示、逐字符平滑掉光) + 坦克三段变色(满蓝打光→满黄→满红) + 基地植物炮台(每正确字符发射种子炮弹，命中白闪/顿挫/火花) + 打错字符发射 missed 灰哑弹(跳弹零伤害/落地 splat/✗错字符飘字) + 预留音效钩子。详细设计见 PLAN.md §10.7。
9. ✅ 含空格文本输入与长文本难度治理：空格不再被拦截，当锁定目标的下一期望字符是空格时作为真实字符输入（否则仍为提交）；长句按 `lengthSpeedFactor` 减速，三个游戏模式统一生效；僵尸 BOSS 另下调为 3 轮输入且基础速度取原值 3/4。详见 PLAN.md §10.8。
10. ✅ 错误分析视图（热力图 + 易错词 + 推荐练习）：训练面板第四个子标签 `Ctrl+Shift+4`。`src/train/error-stats.ts` 纯函数聚合（错误率 50% 满档热力 + 低样本阻尼、薄弱键 Top6、易错词 Top10）+ `src/train/stats-view.ts` 视图控制器（48 键 DOM 热力键盘、方向键漫游、概览 chips、易错词表、最近练习）；练习完成时补记正确击键修复错误率分母（历史 keyStats 只记错误）；键帽/薄弱按钮 → 临时层级薄弱键位专项，易错词行/批量 → SM-2 复习闭环；修复 startReview 在 mode 已是 word 时不退出统计视图的回归（浏览器实测发现，已补单测）。jsdom 噪声改为原型级 getContext 返回 null 的源头静音（Vitest console 拦截会绕过 setup 覆写）。测试基线 20 文件 326 用例全绿（error-stats 13 + stats-view 10 + 接线 7），`build:release` 205.5 KB；浏览器 no-store 实测热力/专项/易错词/复习全闭环、三主题换肤、响应式，控制台零报错。详见 PLAN.md §10 块一·错误分析视图。

---

## 7. 当前阻塞与注意事项

- 无阻塞项。
- 内置词库已预装 `daily` / `programming` / `frequency` / `cet4` / `cet6` 五类（DATA_VERSION=2 按 id 迁移补齐）；PLAN.md 第 11 节规划的中小学课文词库尚未落地，后续按版权合规要求补充。
- 细部 UI/交互（配色、动画时长、音效）仍可据用户反馈微调。

---

## 8. 扩展游戏需求与决策记录

### 8.1 候选评估结果

- **舒尔特专注力训练（放弃）**：用户最初设想在数字格子里放入不同单词、用户依次输入对应单词。评估后用户自行否决，理由：与本项目主线无关，盲打训练与现有「文章练习」没有实质区别，只是排版形态变化。备注：经典舒尔特的训练机制依赖「注视点固定在格子中心 + 余光扫视搜索 + 瞬时指认」，而输入全词需视线离开中心（看键盘或看手区），本质变成串行双任务，已偏离舒尔特本来意图。
- **坦克大战（保留，待实现）**：与既有三种模式区分度高——敌方坦克会向玩家开火、**我方炮弹可与敌方炮弹在飞行途中对消**、玩家有**护盾**（敌炮弹先扣护盾、破盾后才扣生命）。压力源从「目标掉到底部」变为「玩家自身被瞄准」。

### 8.2 已定设计口径

- 坦克移动**不引入手动方向键，且玩家坦克静止不动**（字母键全归 `TypingEngine`，WASD 与打字互斥；快捷键命名空间已拥挤）：玩家坦克固定在底部中央，炮塔自动转向锁定目标，玩家全部交互只有打字。舍弃自动巡航的理由：炮塔已自动瞄准时巡航不产生决策价值，只是装饰，还会让敌炮弹命中判定变随机、让玩家误判为 bug；静止后**对消成为玩家唯一的主动防御手段**。
- 静止带来的几何红利：我方炮弹（玩家→敌坦克）与敌炮弹（敌坦克→玩家）天然共线相向，打「刚开火的那辆」即可迎头对消，打其他坦克则拦不住——这就是本模式的决策层。
- 单词内容源**已定为内置分档词表**（新建 `TANK_CONTENT`，沿用 `SHOOTER_CONTENT` 的 letter/combo/simple/complex/phrase/boss 分档），**不接 VocabularyBank 词库词源**；词源类控件在扩展面板不出现。
- 新增**顶级面板 `extra`（「扩展游戏」）**，位于排行榜之后，快捷键 **Ctrl+5**；面板内部用下拉 `#extra-game-mode` + `Ctrl+Shift+1` 选择具体游戏，为后续扩展游戏预留位置。
- 扩展面板使用**独立隐藏输入框 `#extra-game-input` 与独立实例字段 `extraGame`**，不复用游戏面板的 `#game-input` / `game` / `createGame`，避免两个面板的模式切换互相触发重建；`switchTab` 需扩成训练/游戏/扩展三方焦点互斥。
- 关卡难度沿用**关卡目标制**（非无尽升级），起始 3 命、升关回补 1 命、通关 10 关判定胜利；护盾上限 3，连续对消 N 发（初始 3）或击毁敌坦克掉落回补 1 层。

详细玩法规格、类型与模块清单、实施步骤与风险控制已留底于 **PLAN.md 第 14 节**。当前状态：方案已定，**尚未开始编码**。
