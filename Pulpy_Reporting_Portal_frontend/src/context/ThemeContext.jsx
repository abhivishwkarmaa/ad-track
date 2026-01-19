import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Check localStorage first, then system preference
        const saved = localStorage.getItem('track-myads_theme');
        if (saved) {
            return saved === 'dark';
        }
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return true;
        }
        // Default to light mode
        return false;
    });

    useEffect(() => {
        const theme = isDarkMode ? 'dark' : 'light';
        const root = document.documentElement;

        // Set data-theme attribute and classes
        root.setAttribute('data-theme', theme);
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('track-myads_theme', theme);

        // Clear any inline styles that might interfere with CSS variables
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
        root.style.removeProperty('--bg-primary');
        root.style.removeProperty('--bg-secondary');
        root.style.removeProperty('--text-primary');
    }, [isDarkMode]);

    const toggleTheme = () => {
        setIsDarkMode(prev => !prev);
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
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
