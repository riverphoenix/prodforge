export interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    surface: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      bg: '#0d1117',
      bgSecondary: '#161b22',
      bgTertiary: '#21262d',
      surface: '#1e1e1e',
      border: '#30363d',
      textPrimary: '#c9d1d9',
      textSecondary: '#8b949e',
      textMuted: '#484f58',
      accent: '#58a6ff',
      accentHover: '#79c0ff',
      success: '#3fb950',
      warning: '#d29922',
      error: '#f85149',
      info: '#58a6ff',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: {
      bg: '#0a192f',
      bgSecondary: '#112240',
      bgTertiary: '#1d3557',
      surface: '#0f2444',
      border: '#233554',
      textPrimary: '#ccd6f6',
      textSecondary: '#8892b0',
      textMuted: '#495670',
      accent: '#64ffda',
      accentHover: '#8affd4',
      success: '#64ffda',
      warning: '#ffd166',
      error: '#ff6b6b',
      info: '#57cbff',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      bg: '#1a1e1a',
      bgSecondary: '#232923',
      bgTertiary: '#2d352d',
      surface: '#1e241e',
      border: '#3a443a',
      textPrimary: '#d4ddd4',
      textSecondary: '#8fa88f',
      textMuted: '#566656',
      accent: '#7bc47b',
      accentHover: '#98d898',
      success: '#7bc47b',
      warning: '#d4a750',
      error: '#e06060',
      info: '#6aadcf',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: {
      bg: '#1a1218',
      bgSecondary: '#251a22',
      bgTertiary: '#30222c',
      surface: '#1e161c',
      border: '#3d2d38',
      textPrimary: '#e0d0da',
      textSecondary: '#a08898',
      textMuted: '#685060',
      accent: '#ff7eb3',
      accentHover: '#ff9fc7',
      success: '#8fd694',
      warning: '#f0c060',
      error: '#ff6b6b',
      info: '#7ec8e3',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: {
      bg: '#2e3440',
      bgSecondary: '#3b4252',
      bgTertiary: '#434c5e',
      surface: '#2e3440',
      border: '#4c566a',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      textMuted: '#616e88',
      accent: '#88c0d0',
      accentHover: '#8fbcbb',
      success: '#a3be8c',
      warning: '#ebcb8b',
      error: '#bf616a',
      info: '#81a1c1',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: {
      bg: '#282a36',
      bgSecondary: '#1e1f29',
      bgTertiary: '#44475a',
      surface: '#282a36',
      border: '#44475a',
      textPrimary: '#f8f8f2',
      textSecondary: '#bd93f9',
      textMuted: '#6272a4',
      accent: '#ff79c6',
      accentHover: '#ff92d0',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      info: '#8be9fd',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized Dark',
    colors: {
      bg: '#002b36',
      bgSecondary: '#073642',
      bgTertiary: '#094959',
      surface: '#002b36',
      border: '#586e75',
      textPrimary: '#fdf6e3',
      textSecondary: '#93a1a1',
      textMuted: '#657b83',
      accent: '#268bd2',
      accentHover: '#4da3e2',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      info: '#2aa198',
    },
  },
  {
    id: 'light',
    name: 'Light',
    colors: {
      bg: '#ffffff',
      bgSecondary: '#f6f8fa',
      bgTertiary: '#e1e4e8',
      surface: '#f6f8fa',
      border: '#d0d7de',
      textPrimary: '#24292f',
      textSecondary: '#57606a',
      textMuted: '#8b949e',
      accent: '#0969da',
      accentHover: '#0550ae',
      success: '#1a7f37',
      warning: '#9a6700',
      error: '#cf222e',
      info: '#0969da',
    },
  },
];

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty('--theme-bg', c.bg);
  root.style.setProperty('--theme-bg-secondary', c.bgSecondary);
  root.style.setProperty('--theme-bg-tertiary', c.bgTertiary);
  root.style.setProperty('--theme-surface', c.surface);
  root.style.setProperty('--theme-border', c.border);
  root.style.setProperty('--theme-text-primary', c.textPrimary);
  root.style.setProperty('--theme-text-secondary', c.textSecondary);
  root.style.setProperty('--theme-text-muted', c.textMuted);
  root.style.setProperty('--theme-accent', c.accent);
  root.style.setProperty('--theme-accent-hover', c.accentHover);
  root.style.setProperty('--theme-success', c.success);
  root.style.setProperty('--theme-warning', c.warning);
  root.style.setProperty('--theme-error', c.error);
  root.style.setProperty('--theme-info', c.info);
}

export function getThemeById(id: string): Theme {
  return THEMES.find(t => t.id === id) || THEMES[0];
}
