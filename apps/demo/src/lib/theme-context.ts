import { createContext, useContext } from 'react';

export type ThemeName = 'light' | 'dark';

export const ThemeContext = createContext<{ theme: ThemeName; setTheme: (t: ThemeName) => void }>({
  theme: 'light',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
