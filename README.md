# 打字基本法（Type Prime）

打字基本法（Type Prime，仓库标识 `type-prime`）是一个基于 TypeScript + HTML5 Canvas 的浏览器端指法训练应用，包含分层指法训练、单词/文章练习与词库记忆曲线复习、两款指法游戏（闯关射击、僵尸大战），以及多用户本地存储与排行榜。

## 功能特性

- **标准指法训练**：虚拟键盘显示，按键时高亮对应键位并提示应使用手指。
- **错误分析**：键位错误热力图、易错词排行与最近练习概览，一键发起薄弱键位专项与易错词复习。
- **单词掉落游戏**：单词从屏幕上方掉落，逐字符输入正确即可击落，支持自动锁定目标。
- **多用户切换**：使用 localStorage 保存数据，默认提供 3 个用户，可添加新用户。
- **基础排行榜**：按最高分排序展示所有用户。
- **清晰代码结构**：按模块划分，便于后续扩展词库、关卡、指法演示等功能。

## 项目结构

`src/` 按模块分五个子目录，每个源文件同目录并存同名 `.test.ts` 测试（Vitest + jsdom）：

```
type-prime/
├── index.html          # 页面入口
├── style.css           # 样式（CSS 变量 + 三主题）
├── package.json        # 依赖与脚本
├── tsconfig.json       # TypeScript 配置
├── vitest.config.ts    # 测试配置（vitest.setup.ts 源头静音 jsdom canvas 噪声）
├── README.md           # 说明文档
└── src/
    ├── main.ts         # 应用入口：面板路由、快捷键与模块协调
    ├── core/           # 公共底座
    │   ├── types.ts        # 集中类型定义
    │   ├── storage.ts      # localStorage 多用户与进度数据
    │   ├── input.ts        # TypingEngine 统一输入（含 IME 兼容）
    │   └── dialog.ts       # 页内模态对话框
    ├── render/         # 表现层底座
    │   ├── theme.ts        # 三主题 Canvas 版面色
    │   ├── particle-system.ts  # 粒子池
    │   └── layered-canvas.ts   # 分层渲染（静态层离屏缓存）
    ├── train/          # 指法训练
    │   ├── keyboard.ts     # DOM 虚拟键盘与指法提示
    │   ├── keyboard-anim.ts    # 缩略键盘动画状态机
    │   ├── train-engine.ts     # 分级练习引擎
    │   ├── train-panel.ts      # 训练面板（键位/单词/文章/复习/错误分析）
    │   ├── error-stats.ts      # 错误统计聚合（热力/薄弱键/易错词）
    │   ├── stats-view.ts       # 错误分析视图（热力键盘/易错词表）
    │   └── articles.ts       # 分级预装文章库
    ├── games/          # 指法游戏
    │   ├── game-engine.ts      # 游戏公共基类（循环/状态/输入）
    │   ├── game.ts             # 单词掉落
    │   ├── typing-shooter-game.ts  # 闯关射击
    │   ├── zombie-typing-game.ts   # 僵尸大战
    │   └── sound-manager.ts    # WebAudio 合成音效
    └── vocab/          # 词库与记忆曲线
        ├── vocabulary.ts   # VocabularyBank 词库管理
        ├── review.ts       # SM-2 复习调度
        ├── vocab-panel.ts  # 词库管理面板
        └── assets/vocab/   # 预装词库数据（日常/编程/四六级/高频）
```

编译输出 `dist/` 与 `src/` 同构；跨模块 import 使用 `../<模块>/x.js` 相对路径。

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 编译 TypeScript

```bash
npm run build
```

编译后会生成 `dist/` 目录，包含 `main.js`。

### 3. 启动本地服务器

```bash
npm run serve
```

然后打开浏览器访问提示的地址（通常是 http://localhost:3000）。

> 注意：由于使用了 ES Module，直接双击 `index.html` 打开可能会因为 CORS 限制导致模块加载失败，建议使用本地服务器运行。

### 4. 下载即用（离线单文件，无需服务器）

从 [GitHub Releases](https://github.com/yanzhen74/type-prime/releases) 下载 `type-prime-standalone.html`（或对应 zip 包），双击即可在任意现代浏览器离线运行，无需安装 Node 或启动服务器。该单文件由发版流水线自动构建（内联 CSS 与打包后的 JS）。

本地也可自行构建单文件包：

```bash
npm run build:release
```

产物位于 `release/type-prime-standalone.html`。

## 发版流程（GitHub Actions 自动构建发布）

仓库已配置 [.github/workflows/release.yml](.github/workflows/release.yml)：推送 `v*` tag（或手动触发 workflow_dispatch）时，GitHub Actions 会自动执行 lint / 测试 / 构建，打包单文件离线包与 zip，并创建 GitHub Release 附带下载资产。

发版步骤：

1. 同步版本号：将 `package.json` 的 `version` 改为目标版本（如 `0.3.1`）。
2. 提交改动：`git commit`。
3. 打 tag：`git tag -a v0.3.1 -m "v0.3.1: 说明"`。
4. 推送分支与 tag：
   ```bash
   git push origin master
   git push origin v0.3.1
   ```
5. 在 [Releases](https://github.com/yanzhen74/type-prime/releases) 页查看自动生成的 Release 与下载资产。

> 说明：`release/` 为本地构建产物，已加入 `.gitignore`，不入库；Release 资产由 CI 生成。

## 后续扩展建议

- 接入更丰富的词库与难度分级。
- 增加手指动态演示动画（第一人称/第三人称视角）。
- 引入遗忘曲线复习机制。
- 增加音效、粒子特效、关卡与 BOSS 战。
- 将 Canvas 渲染迁移到 WebGL 或游戏引擎以获得更强表现力。
