import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypingEngine } from './input.js';
import type { TypingEvent } from './types.js';

describe('TypingEngine', () => {
  let engine: TypingEngine;
  let events: TypingEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    events = [];
    engine = new TypingEngine();
    unsubscribe = engine.on((event) => events.push(event));
  });

  afterEach(() => {
    unsubscribe();
    engine.destroy();
  });

  function dispatchInput(data: string): void {
    const event = new InputEvent('input', { data });
    engine['input'].dispatchEvent(event);
  }

  function dispatchKey(key: string, target?: HTMLElement): void {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    (target ?? document.body).dispatchEvent(event);
  }

  it('emits char events for printable input', () => {
    dispatchInput('abc');
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'char', char: 'a' });
    expect(events[1]).toEqual({ type: 'char', char: 'b' });
    expect(events[2]).toEqual({ type: 'char', char: 'c' });
  });

  it('emits char events for digits and symbols', () => {
    dispatchInput('1!@');
    expect(events.map((e) => (e.type === 'char' ? e.char : ''))).toEqual(['1', '!', '@']);
  });

  it('emits backspace event', () => {
    dispatchKey('Backspace');
    expect(events).toEqual([{ type: 'backspace' }]);
  });

  it('emits submit event for Enter', () => {
    dispatchKey('Enter');
    expect(events).toEqual([{ type: 'submit' }]);
  });

  it('emits escape event', () => {
    dispatchKey('Escape');
    expect(events).toEqual([{ type: 'escape' }]);
  });

  it('does not intercept keys when another input is focused', () => {
    const otherInput = document.createElement('input');
    document.body.appendChild(otherInput);
    dispatchKey('Backspace', otherInput);
    expect(events).toHaveLength(0);
    document.body.removeChild(otherInput);
  });

  it('supports unsubscribing', () => {
    unsubscribe();
    dispatchInput('x');
    expect(events).toHaveLength(0);
  });
});
