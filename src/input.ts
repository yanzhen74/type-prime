import type { TypingEvent } from './types.js';

export type TypingEventHandler = (event: TypingEvent) => void;

/**
 * 统一输入引擎。
 *
 * 监听隐藏输入框的 `input` 事件获取实际输入字符（兼容中文输入法等 IME 场景），
 * 同时监听 `keydown` 获取 Backspace、Enter、Escape 等功能键。
 *
 * 该引擎不绑定任何业务逻辑，仅向订阅者分发标准化事件：
 * - `char`：可打印字符（包括字母、数字、符号、空格等完整打字机键位）
 * - `backspace`：退格
 * - `submit`：回车确认
 * - `escape`：Esc（通常用于暂停）
 */
export class TypingEngine {
  private input: HTMLInputElement;
  private handlers = new Set<TypingEventHandler>();
  private boundKeydown: (e: KeyboardEvent) => void;
  private boundInput: (e: Event) => void;
  private boundBlur: () => void;

  constructor(inputOrId?: HTMLInputElement | string) {
    this.input = this.resolveInput(inputOrId);
    this.boundKeydown = (e) => this.handleKeydown(e);
    this.boundInput = (e) => this.handleInput(e as InputEvent);
    this.boundBlur = () => this.focus();

    window.addEventListener('keydown', this.boundKeydown);
    this.input.addEventListener('input', this.boundInput);
    this.input.addEventListener('blur', this.boundBlur);

    this.focus();
  }

  on(handler: TypingEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.boundKeydown);
    this.input.removeEventListener('input', this.boundInput);
    this.input.removeEventListener('blur', this.boundBlur);
    if (this.input.parentNode && this.input.dataset.typeprime === 'true') {
      this.input.parentNode.removeChild(this.input);
    }
  }

  focus(): void {
    // 延迟聚焦，避免与鼠标点击冲突
    window.setTimeout(() => {
      this.input.focus();
    }, 0);
  }

  private resolveInput(inputOrId?: HTMLInputElement | string): HTMLInputElement {
    if (inputOrId instanceof HTMLInputElement) {
      return inputOrId;
    }
    if (typeof inputOrId === 'string') {
      const el = document.getElementById(inputOrId);
      if (el instanceof HTMLInputElement) {
        return el;
      }
      throw new Error(`Input element with id "${inputOrId}" not found`);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-hidden', 'true');
    input.dataset.typeprime = 'true';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    return input;
  }

  private handleKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && target !== this.input) {
      const tag = target.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
        // 不拦截其他输入框的快捷键
        return;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this.emit({ type: 'escape' });
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      this.emit({ type: 'backspace' });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      this.emit({ type: 'submit' });
      return;
    }

    // 其余可打印字符由 input 事件统一处理，避免与 IME 冲突
  }

  private handleInput(e: InputEvent): void {
    const data = e.data;
    if (!data) {
      return;
    }

    for (const char of data) {
      this.emit({ type: 'char', char });
    }

    // 清空输入框，避免累积字符影响下一次判断
    this.input.value = '';
  }

  private emit(event: TypingEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
