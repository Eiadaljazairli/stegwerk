import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'stegwerk.theme';

export const DEFAULT_THEME: ThemeChoice = 'light';

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'Hell',
  dark: 'Dunkel',
  system: 'System',
};

const read = (): ThemeChoice => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const applyTheme = (choice: ThemeChoice): void => {
  if (choice === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
};

export const useTheme = () => {
  const [choice, setChoice] = useState<ThemeChoice>(read);

  useEffect(() => {
    applyTheme(choice);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {}
  }, [choice]);

  return { choice, setChoice };
};
