import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Dialog } from './dialog.js';

function okButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('[data-dialog-ok]')!;
}
function cancelButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-dialog-cancel]');
}
function inputEl(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.dialog-input');
}
function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.dialog-overlay');
}
function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('Dialog', () => {
  let dialog: Dialog;

  beforeEach(() => {
    document.body.innerHTML = '';
    dialog = new Dialog();
  });

  afterEach(() => {
    dialog.close();
    document.body.innerHTML = '';
  });

  it('open 渲染覆盖层、标题与输入框，并处于打开状态', async () => {
    const promise = dialog.open({ title: '添加用户', input: { label: '用户名' } });
    expect(dialog.isOpen()).toBe(true);
    expect(overlay()).not.toBeNull();
    expect(document.querySelector('.dialog-title')?.textContent).toBe('添加用户');
    expect(document.querySelector('.dialog-label')?.textContent).toBe('用户名');
    expect(inputEl()).not.toBeNull();
    dialog.close();
    await promise;
  });

  it('输入内容后点击确定，resolve confirmed=true 且携带值', async () => {
    const promise = dialog.open({ title: 't', input: {} });
    inputEl()!.value = 'Alice';
    okButton().click();
    await expect(promise).resolves.toEqual({ confirmed: true, value: 'Alice' });
    expect(dialog.isOpen()).toBe(false);
    expect(overlay()).toBeNull();
  });

  it('点击取消 resolve confirmed=false', async () => {
    const promise = dialog.open({ title: 't', input: {} });
    cancelButton()!.click();
    await expect(promise).resolves.toEqual({ confirmed: false, value: '' });
  });

  it('Enter 键确认，Escape 键取消', async () => {
    const p1 = dialog.open({ title: 't', input: {} });
    inputEl()!.value = 'Bob';
    pressKey('Enter');
    await expect(p1).resolves.toEqual({ confirmed: true, value: 'Bob' });

    const p2 = dialog.open({ title: 't', input: {} });
    pressKey('Escape');
    await expect(p2).resolves.toEqual({ confirmed: false, value: '' });
  });

  it('alert 模式（showCancel:false）不渲染取消按钮并展示消息', async () => {
    const promise = dialog.open({
      title: '游戏结束',
      message: '得分：120',
      showCancel: false,
    });
    expect(cancelButton()).toBeNull();
    expect(inputEl()).toBeNull();
    expect(document.querySelector('.dialog-message')?.textContent).toBe('得分：120');
    okButton().click();
    await expect(promise).resolves.toEqual({ confirmed: true, value: '' });
  });

  it('点击遮罩空白处取消，点击对话框本体不取消', async () => {
    const promise = dialog.open({ title: 't', input: {} });
    const box = document.querySelector('.dialog-box')!;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.isOpen()).toBe(true);
    overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(promise).resolves.toEqual({ confirmed: false, value: '' });
  });

  it('自定义按钮文案生效', async () => {
    const promise = dialog.open({ title: 't', input: {}, okText: '添加', cancelText: '放弃' });
    expect(okButton().textContent).toBe('添加');
    expect(cancelButton()!.textContent).toBe('放弃');
    dialog.close();
    await promise;
  });
});
