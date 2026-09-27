import type { Finger } from './types.js';

interface KeyInfo {
  label: string;
  code: string;
  finger: Finger;
  width?: number;
}

const ROWS: KeyInfo[][] = [
  [
    { label: '`', code: 'Backquote', finger: 'pinky' },
    { label: '1', code: 'Digit1', finger: 'pinky' },
    { label: '2', code: 'Digit2', finger: 'ring' },
    { label: '3', code: 'Digit3', finger: 'middle' },
    { label: '4', code: 'Digit4', finger: 'index' },
    { label: '5', code: 'Digit5', finger: 'index' },
    { label: '6', code: 'Digit6', finger: 'index' },
    { label: '7', code: 'Digit7', finger: 'index' },
    { label: '8', code: 'Digit8', finger: 'middle' },
    { label: '9', code: 'Digit9', finger: 'ring' },
    { label: '0', code: 'Digit0', finger: 'pinky' },
    { label: '-', code: 'Minus', finger: 'pinky' },
    { label: '=', code: 'Equal', finger: 'pinky' },
  ],
  [
    { label: 'Q', code: 'KeyQ', finger: 'pinky' },
    { label: 'W', code: 'KeyW', finger: 'ring' },
    { label: 'E', code: 'KeyE', finger: 'middle' },
    { label: 'R', code: 'KeyR', finger: 'index' },
    { label: 'T', code: 'KeyT', finger: 'index' },
    { label: 'Y', code: 'KeyY', finger: 'index' },
    { label: 'U', code: 'KeyU', finger: 'index' },
    { label: 'I', code: 'KeyI', finger: 'middle' },
    { label: 'O', code: 'KeyO', finger: 'ring' },
    { label: 'P', code: 'KeyP', finger: 'pinky' },
    { label: '[', code: 'BracketLeft', finger: 'pinky' },
    { label: ']', code: 'BracketRight', finger: 'pinky' },
    { label: '\\', code: 'Backslash', finger: 'pinky' },
  ],
  [
    { label: 'A', code: 'KeyA', finger: 'pinky' },
    { label: 'S', code: 'KeyS', finger: 'ring' },
    { label: 'D', code: 'KeyD', finger: 'middle' },
    { label: 'F', code: 'KeyF', finger: 'index' },
    { label: 'G', code: 'KeyG', finger: 'index' },
    { label: 'H', code: 'KeyH', finger: 'index' },
    { label: 'J', code: 'KeyJ', finger: 'index' },
    { label: 'K', code: 'KeyK', finger: 'middle' },
    { label: 'L', code: 'KeyL', finger: 'ring' },
    { label: ';', code: 'Semicolon', finger: 'pinky' },
    { label: "'", code: 'Quote', finger: 'pinky' },
  ],
  [
    { label: 'Z', code: 'KeyZ', finger: 'pinky' },
    { label: 'X', code: 'KeyX', finger: 'ring' },
    { label: 'C', code: 'KeyC', finger: 'middle' },
    { label: 'V', code: 'KeyV', finger: 'index' },
    { label: 'B', code: 'KeyB', finger: 'index' },
    { label: 'N', code: 'KeyN', finger: 'index' },
    { label: 'M', code: 'KeyM', finger: 'index' },
    { label: ',', code: 'Comma', finger: 'middle' },
    { label: '.', code: 'Period', finger: 'ring' },
    { label: '/', code: 'Slash', finger: 'pinky' },
  ],
  [{ label: 'Space', code: 'Space', finger: 'thumb', width: 280 }],
];

const CODE_MAP = new Map<string, KeyInfo>();
for (const row of ROWS) {
  for (const key of row) {
    CODE_MAP.set(key.code, key);
  }
}

export class KeyboardRenderer {
  private container: HTMLElement;
  private keyElements = new Map<string, HTMLElement>();
  private hintEl: HTMLElement;

  constructor(containerId: string, hintId: string) {
    const container = document.getElementById(containerId);
    const hint = document.getElementById(hintId);
    if (!container || !hint) {
      throw new Error('Keyboard container or hint element not found');
    }
    this.container = container;
    this.hintEl = hint;
    this.render();
  }

  private render(): void {
    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      for (const key of row) {
        const keyEl = document.createElement('div');
        keyEl.className = `key ${key.finger}`;
        keyEl.textContent = key.label;
        keyEl.dataset.code = key.code;
        if (key.label === 'Space') {
          keyEl.classList.add('space');
          keyEl.style.width = `${key.width}px`;
        }
        this.keyElements.set(key.code, keyEl);
        rowEl.appendChild(keyEl);
      }
      this.container.appendChild(rowEl);
    }
  }

  highlight(code: string): void {
    const key = CODE_MAP.get(code);
    const el = this.keyElements.get(code);
    if (!key || !el) {
      this.hintEl.textContent = '未识别键位，请使用标准键盘布局练习';
      return;
    }

    this.clear();
    el.classList.add('active');
    this.hintEl.textContent = `${key.label} → 使用 ${this.fingerName(key.finger)}`;

    window.setTimeout(() => {
      el.classList.remove('active');
    }, 200);
  }

  clear(): void {
    for (const el of this.keyElements.values()) {
      el.classList.remove('active');
    }
  }

  private fingerName(finger: Finger): string {
    const map: Record<Finger, string> = {
      pinky: '小指',
      ring: '无名指',
      middle: '中指',
      index: '食指',
      thumb: '拇指',
      unknown: '未知手指',
    };
    return map[finger];
  }
}
