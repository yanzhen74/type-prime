import type { Finger } from './types.js';

type Hand = 'left' | 'right';

interface KeyInfo {
  label: string;
  code: string;
  finger: Finger;
  hand: Hand;
  width?: number;
}

type KeySeed = Omit<KeyInfo, 'hand'>;

const ROW_SEEDS: KeySeed[][] = [
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

// 每一行左右手的分界索引：分界点之前的键属于左手，之后属于右手。
// 数字行含反引号键，分界点比字母行右移一位；空格行由双手拇指共用，不做分隔。
const HAND_SPLIT_INDEXES = [6, 5, 5, 5, 1];

const ROWS: KeyInfo[][] = ROW_SEEDS.map((row, rowIdx) => {
  const split = HAND_SPLIT_INDEXES[rowIdx] ?? row.length;
  return row.map((key, i) => ({
    ...key,
    hand: i < split ? ('left' as const) : ('right' as const),
  }));
});

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
  private fingerElements = new Map<string, HTMLElement>();

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
    for (let rowIdx = 0; rowIdx < ROWS.length; rowIdx++) {
      const row = ROWS[rowIdx];
      const split = HAND_SPLIT_INDEXES[rowIdx] ?? -1;
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      for (let i = 0; i < row.length; i++) {
        if (split >= 0 && i === split && row.length > split) {
          const divider = document.createElement('div');
          divider.className = 'hand-divider';
          divider.setAttribute('aria-hidden', 'true');
          rowEl.appendChild(divider);
        }

        const key = row[i];
        const keyEl = document.createElement('div');
        keyEl.className = `key ${key.finger} hand-${key.hand}`;
        keyEl.textContent = key.label;
        keyEl.dataset.code = key.code;
        keyEl.dataset.hand = key.hand;
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

    wrapper.appendChild(
      this.createHand('左手', 'left', ['pinky', 'ring', 'middle', 'index', 'thumb'])
    );
    wrapper.appendChild(
      this.createHand('右手', 'right', ['thumb', 'index', 'middle', 'ring', 'pinky'])
    );

    this.handsEl.appendChild(wrapper);
    this.handsEl.appendChild(this.createLegend());
  }

  private createHand(label: string, handSide: Hand, fingers: Finger[]): HTMLElement {
    const hand = document.createElement('div');
    hand.className = `hand hand-${handSide}`;

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
      fingerEl.dataset.hand = handSide;
      fingerEl.title = `${label}·${this.fingerName(finger)}`;
      this.fingerElements.set(`${handSide}:${finger}`, fingerEl);
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

    const handItems: [Hand, string][] = [
      ['left', '左手'],
      ['right', '右手'],
    ];
    for (const [handSide, name] of handItems) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = `legend-dot hand-${handSide}`;
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
    const handName = key.hand === 'left' ? '左手' : '右手';
    this.hintEl.textContent = `${key.label} → ${handName} ${this.fingerName(key.finger)}`;

    const fingerEl = this.fingerElements.get(`${key.hand}:${key.finger}`);
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
