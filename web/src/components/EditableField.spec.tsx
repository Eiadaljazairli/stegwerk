// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditableField } from './EditableField';
import './testumgebung';

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const zeichne = async (value: string, onSave: (wert: string) => void) => {
  await act(async () => {
    root?.render(<EditableField label="Ort" value={value} onSave={onSave} />);
  });
};

const tippen = (eingabe: HTMLInputElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;

  setter?.call(eingabe, text);
  eingabe.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('EditableField bei Änderungen anderer', () => {
  it('zeigt den neuen Wert neben dem Entwurf und übernimmt ihn auf Wunsch', async () => {
    const onSave = vi.fn();

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await zeichne('Berlin', onSave);
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button')?.click();
    });

    const eingabe = container.querySelector('input') as HTMLInputElement;

    await act(async () => tippen(eingabe, 'Bremen'));

    expect(container.querySelector('[role="alert"]')).toBeNull();

    await zeichne('Hamburg', onSave);

    const hinweis = container.querySelector('.feld-konflikt');

    expect(hinweis?.textContent).toContain('„Hamburg“');
    expect(eingabe.value).toBe('Bremen');
    expect(eingabe.getAttribute('aria-describedby')).toBe(hinweis?.id);

    await act(async () => {
      [...(container?.querySelectorAll('button') ?? [])]
        .find((knopf) => knopf.textContent === 'Neuen Wert übernehmen')
        ?.click();
    });

    expect((container.querySelector('input') as HTMLInputElement).value).toBe(
      'Hamburg',
    );
    expect(container.querySelector('.feld-konflikt')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  const oeffnen = async (onSave: (wert: string) => void) => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await zeichne('Berlin', onSave);
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button')?.click();
    });

    return container.querySelector('input') as HTMLInputElement;
  };

  it('lässt sich per Tastatur lösen: Tab zum Knopf speichert nicht', async () => {
    const onSave = vi.fn();
    const eingabe = await oeffnen(onSave);

    await act(async () => tippen(eingabe, 'Bremen'));
    await zeichne('Hamburg', onSave);

    const knopf = [...(container?.querySelectorAll('button') ?? [])].find(
      (k) => k.textContent === 'Neuen Wert übernehmen',
    ) as HTMLButtonElement;

    await act(async () => knopf.focus());

    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(knopf);

    await act(async () => knopf.click());

    const danach = container?.querySelector('input') as HTMLInputElement;

    expect(danach.value).toBe('Hamburg');
    expect(document.activeElement).toBe(danach);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('speichert beim bloßen Verlassen ohne Eingabe nicht über den neuen Wert', async () => {
    const onSave = vi.fn();
    const eingabe = await oeffnen(onSave);

    await zeichne('Hamburg', onSave);
    await act(async () => eingabe.blur());

    expect(onSave).not.toHaveBeenCalled();
    expect(container?.querySelector('input')).toBeNull();
    expect(container?.textContent).toContain('Hamburg');
  });

  it('speichert mit Enter ausdrücklich, auch über den neuen Wert', async () => {
    const onSave = vi.fn();
    const eingabe = await oeffnen(onSave);

    await act(async () => tippen(eingabe, 'Bremen'));
    await zeichne('Hamburg', onSave);
    await act(async () => {
      eingabe.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });

    expect(onSave).toHaveBeenCalledWith('Bremen');
  });

  it('speichert eine Eingabe beim Verlassen wie bisher', async () => {
    const onSave = vi.fn();
    const eingabe = await oeffnen(onSave);

    await act(async () => tippen(eingabe, 'Bremen'));
    await act(async () => eingabe.blur());

    expect(onSave).toHaveBeenCalledWith('Bremen');
  });
});
