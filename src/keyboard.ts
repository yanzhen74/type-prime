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

const HAND_SPLIT_INDEX = 5;

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
  private handsEl: HTMLElement;
  private fingerElements = new Map<Finger, HTMLElement>();

  constructor(containerId: string, hintId: string, handsId: string) {
    const container = document.getElementById(containerId);
    const hint = document.getElementById(hintId);
    const hands = document.getElementById(handsId);
    if (!container || !hint || !hands) {
      throw new Error('Keyboard container, hint or hands element not found');
    }
    this.container = container;
    this.hintEl = hint;
    this.handsEl = hands;
    this.renderKeyboard();
    this.renderHands();
  }

  private renderKeyboard(): void {
    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      for (let i = 0; i < row.length; i++) {
        if (i === HAND_SPLIT_INDEX && row.length > HAND_SPLIT_INDEX) {
          const divider = document.createElement('div');
          divider.className = 'hand-divider';
          divider.setAttribute('aria-hidden', 'true');
          rowEl.appendChild(divider);
        }

        const key = row[i];
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

  private renderHands(): void {
    this.handsEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'hands-wrapper';

    wrapper.appendChild(this.createHand('左手', ['pinky', 'ring', 'middle', 'index', 'thumb']));
    wrapper.appendChild(this.createHand('右手', ['thumb', 'index', 'middle', 'ring', 'pinky']));

    this.handsEl.appendChild(wrapper);
    this.handsEl.appendChild(this.createLegend());
  }

  private createHand(label: string, fingers: Finger[]): HTMLElement {
    const hand = document.createElement('div');
    hand.className = 'hand';

    const title = document.createElement('div');
    title.className = 'hand-label';
    title.textContent = label;
    hand.appendChild(title);

    const fingersEl = document.createElement('div');
    fingersEl.className = 'fingers';
    for (const finger of fingers) {
      const fingerEl = document.createElement('div');
      fingerEl.className = `finger ${finger}`;
      fingerEl.dataset.finger = finger;
      fingerEl.title = this.fingerName(finger);
      this.fingerElements.set(finger, fingerEl);
      fingersEl.appendChild(fingerEl);
    }
    hand.appendChild(fingersEl);

    return hand;
  }

  private createLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'finger-legend';
    const items: [Finger, string][] = [
      ['pinky', '小指'],
      ['ring', '无名指'],
      ['middle', '中指'],
      ['index', '食指'],
      ['thumb', '拇指'],
    ];
    for (const [finger, name] of items) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = `legend-dot ${finger}`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(name));
      legend.appendChild(item);
    }
    return legend;
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

    const fingerEl = this.fingerElements.get(key.finger);
    fingerEl?.classList.add('active');

    window.setTimeout(() => {
      el.classList.remove('active');
      fingerEl?.classList.remove('active');
    }, 200);
  }

  clear(): void {
    for (const el of this.keyElements.values()) {
      el.classList.remove('active');
    }
    for (const el of this.fingerElements.values()) {
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
