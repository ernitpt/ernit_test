import { useTheme } from './ThemeContext';

/**
 * Returns the resolved color palette based on the current theme.
 * Use this hook in any component that needs theme-aware colors.
 *
 * Usage: const colors = useColors();
 */
export const useColors = () => useTheme().colors;
