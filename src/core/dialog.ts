export interface DialogInputConfig {
  /** 输入框上方的说明标签 */
  label?: string;
  placeholder?: string;
  value?: string;
}

export interface DialogOptions {
  title: string;
  /** 纯文本提示信息（alert 场景） */
  message?: string;
  /** 传入则渲染输入框（prompt 场景） */
  input?: DialogInputConfig;
  okText?: string;
  cancelText?: string;
  /** 是否显示取消按钮，默认 true；alert 场景传 false */
  showCancel?: boolean;
}

export interface DialogResult {
  /** 用户是否点击了确定（Enter / 确定按钮） */
  confirmed: boolean;
  /** 输入框内容（无输入框时为空串） */
  value: string;
}

/**
 * 轻量级页内模态对话框。
 *
 * 用于替代被沙箱 iframe 禁用的 `window.prompt` / `window.alert` / `window.confirm`：
 * 在内嵌预览浏览器中原生对话框调用会直接返回 null 且不显示，表现为「点击无反应」。
 * Dialog 自行构建 DOM 覆盖层，通过 Promise 返回用户输入或确认状态。
 *
 * 键盘交互：`Enter` 确认、`Escape` 取消；点击遮罩空白处取消。
 * 由于 TypingEngine 会忽略聚焦在 input/textarea 上的按键，弹窗打开期间
 * 隐藏输入框不会抢占键盘事件（调用方仍应 suspend 训练输入以阻断自动重聚焦）。
 */
export class Dialog {
  private overlay: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private resolver: ((result: DialogResult) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** 当前是否有对话框处于打开状态 */
  isOpen(): boolean {
    return this.overlay !== null;
  }

  /** 打开对话框，返回一个在用户确认/取消后 resolve 的 Promise */
  open(options: DialogOptions): Promise<DialogResult> {
    // 同一时刻仅允许一个对话框，若已存在则先以取消收尾
    if (this.isOpen()) {
      this.close();
    }
    return new Promise<DialogResult>((resolve) => {
      this.resolver = resolve;
      this.overlay = this.build(options);
      document.body.appendChild(this.overlay);

      this.keyHandler = (e: KeyboardEvent) => this.onKeydown(e);
      document.addEventListener('keydown', this.keyHandler, true);

      if (this.inputEl) {
        this.inputEl.focus();
      } else {
        this.overlay.querySelector<HTMLButtonElement>('[data-dialog-ok]')?.focus();
      }
    });
  }

  /** 以「取消」关闭当前对话框（若存在） */
  close(): void {
    if (this.isOpen()) {
      this.settle({ confirmed: false, value: '' });
    }
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.isOpen()) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.settle({ confirmed: false, value: '' });
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      this.settle({ confirmed: true, value: this.inputEl?.value ?? '' });
    }
  }

  private settle(result: DialogResult): void {
    const resolver = this.resolver;
    this.teardown();
    resolver?.(result);
  }

  private teardown(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.inputEl = null;
    this.resolver = null;
  }

  private build(options: DialogOptions): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'dialog-box';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = options.title;
    box.appendChild(title);

    if (options.message) {
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = options.message;
      box.appendChild(message);
    }

    if (options.input) {
      if (options.input.label) {
        const label = document.createElement('label');
        label.className = 'dialog-label';
        label.textContent = options.input.label;
        box.appendChild(label);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dialog-input';
      input.placeholder = options.input.placeholder ?? '';
      input.value = options.input.value ?? '';
      input.autocomplete = 'off';
      box.appendChild(input);
      this.inputEl = input;
    }

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    if (options.showCancel !== false) {
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.setAttribute('data-dialog-cancel', '');
      cancel.textContent = options.cancelText ?? '取消';
      cancel.addEventListener('click', () => this.settle({ confirmed: false, value: '' }));
      actions.appendChild(cancel);
    }

    const ok = document.createElement('button');
    ok.className = 'btn btn-accent';
    ok.setAttribute('data-dialog-ok', '');
    ok.textContent = options.okText ?? '确定';
    ok.addEventListener('click', () =>
      this.settle({ confirmed: true, value: this.inputEl?.value ?? '' })
    );
    actions.appendChild(ok);

    box.appendChild(actions);
    overlay.appendChild(box);

    // 点击遮罩空白区域取消（点击对话框本体不触发）
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.settle({ confirmed: false, value: '' });
      }
    });

    return overlay;
  }
}
