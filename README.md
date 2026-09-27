# type-prime

一个基于 TypeScript + HTML5 Canvas 的浏览器端打字游戏原型，包含标准指法训练、单词掉落游戏、多用户本地存储与排行榜功能。

## 功能特性

- **标准指法训练**：虚拟键盘显示，按键时高亮对应键位并提示应使用手指。
- **单词掉落游戏**：单词从屏幕上方掉落，逐字符输入正确即可击落，支持自动锁定目标。
- **多用户切换**：使用 localStorage 保存数据，默认提供 3 个用户，可添加新用户。
- **基础排行榜**：按最高分排序展示所有用户。
- **清晰代码结构**：按模块划分，便于后续扩展词库、关卡、指法演示等功能。

## 项目结构

```
type-prime/
├── index.html          # 页面入口
├── style.css           # 样式
├── package.json        # 依赖与脚本
├── tsconfig.json       # TypeScript 配置
├── README.md           # 说明文档
└── src/
    ├── types.ts        # 类型定义
    ├── storage.ts      # localStorage 用户数据管理
    ├── keyboard.ts     # 虚拟键盘渲染与指法提示
    ├── game.ts         # Canvas 游戏逻辑
    └── main.ts         # 应用入口与事件绑定
```

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

## 后续扩展建议

- 接入更丰富的词库与难度分级。
- 增加手指动态演示动画（第一人称/第三人称视角）。
- 引入遗忘曲线复习机制。
- 增加音效、粒子特效、关卡与 BOSS 战。
- 将 Canvas 渲染迁移到 WebGL 或游戏引擎以获得更强表现力。
