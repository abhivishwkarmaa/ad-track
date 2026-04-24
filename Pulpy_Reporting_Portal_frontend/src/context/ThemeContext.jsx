/* eslint-disable react-refresh/only-export-components -- context + hook */
import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext(null);

/** App is light-only; dark mode is disabled. */
export function ThemeProvider({ children }) {
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'light');
        root.classList.remove('dark');
        root.classList.add('light');
        try {
            localStorage.setItem('track-myads_theme', 'light');
        } catch {
            /* ignore */
        }
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
        root.style.removeProperty('--bg-primary');
        root.style.removeProperty('--bg-secondary');
        root.style.removeProperty('--text-primary');
    }, []);

    return (
        <ThemeContext.Provider value={{ isDarkMode: false, toggleTheme: () => {} }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
