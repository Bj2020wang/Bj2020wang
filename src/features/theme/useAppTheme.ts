import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'todo-calendar-theme';

export type AppTheme = 'dark' | 'light';

function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
