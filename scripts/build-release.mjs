// 将应用打包为单文件可离线运行 HTML（内联 CSS + IIFE JS），供 GitHub Release 下载后双击运行。
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('release', { recursive: true });

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
});
const bundleJs = result.outputFiles[0].text;

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');

let out = html.replace(/<link rel="stylesheet" href="style\.css[^"]*"\s*\/>/, () => `<style>\n${css}\n</style>`);
out = out.replace(/<script type="module" src="dist\/main\.js[^"]*"><\/script>/, () => `<script>\n${bundleJs}\n</script>`);

if (out === html) {
  console.error('build-release: 未能内联 CSS/JS，index.html 结构可能已变化');
  process.exit(1);
}

writeFileSync('release/type-prime-standalone.html', out);
console.log(`build-release: release/type-prime-standalone.html (${(out.length / 1024).toFixed(1)} KB)`);
