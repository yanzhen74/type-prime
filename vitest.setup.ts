// jsdom 不实现 canvas 绘制：getContext 的 not-implemented 属环境噪声而非缺陷，
// 在 worker 内过滤这类 jsdomError 转发，保留其余控制台输出（VirtualConsole
// 实例含函数，无法经 environmentOptions 序列化进 forks worker，故放 setup）。
const realError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('Not implemented:')) {
    return;
  }
  realError(...args);
};
