import React, { createContext, useContext, useMemo } from 'react';
import { colors } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Palette = typeof colors.dark;
const ThemeContext = createContext<Palette>(colors.dark);

export function ThemeProvider({ mode, systemDark, children }: React.PropsWithChildren<{ mode: ThemeMode; systemDark: boolean }>) {
  const palette = useMemo(() => (mode === 'dark' || (mode === 'system' && systemDark) ? colors.dark : colors.light), [mode, systemDark]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}
export function usePalette() { return useContext(ThemeContext); }
