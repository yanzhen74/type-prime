// jsdom 不实现 canvas 绘制：getContext 的 not-implemented 属环境噪声而非缺陷。
// Vitest 的 console 拦截在 worker 初始化时捕获原始 console，会绕过 setup 里的
// console.error 覆写，故在源头静音：原型级 getContext 直接返回 null（与 jsdom
// 未安装 canvas 包时的返回值一致，降级路径语义不变）。测试在实例级覆写的
// 录制 ctx（mountKeyboardCanvas / createElement spy）不受原型补丁影响。
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
