import { useState, useEffect, useRef, useCallback } from 'react';
import { useRefresh } from '../../context/RefreshContext';
import './RefreshButton.css';

const STORAGE_KEY = 'refresh_button_position';
const DEFAULT_POSITION = { right: 30, bottom: 30 };
const DRAG_THRESHOLD = 5; // Minimum pixels moved to consider it a drag

const RefreshButton = () => {
    const { triggerRefresh } = useRefresh();

    const [position, setPosition] = useState(DEFAULT_POSITION);
    const [isDragging, setIsDragging] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const buttonRef = useRef(null);
    const startPos = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    // Load saved position on mount
    useEffect(() => {
        try {
            const savedPosition = localStorage.getItem(STORAGE_KEY);
            if (savedPosition) {
                const parsed = JSON.parse(savedPosition);
                const maxRight = window.innerWidth - 60;
                const maxBottom = window.innerHeight - 60;
                setPosition({
                    right: Math.min(Math.max(0, parsed.right), maxRight),
                    bottom: Math.min(Math.max(0, parsed.bottom), maxBottom)
                });
            }
        } catch (error) {
            console.error('Error loading refresh button position:', error);
        }
    }, []);

    // Save position to localStorage
    const savePosition = useCallback((pos) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
        } catch (error) {
            console.error('Error saving refresh button position:', error);
        }
    }, []);

    // Handle mouse/touch down
    const handleDragStart = useCallback((e) => {
        e.preventDefault();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        // Store the starting position
        startPos.current = { x: clientX, y: clientY };
        hasMoved.current = false;

        setIsDragging(true);
    }, []);

    // Handle mouse/touch move
    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        // Check if we've actually moved beyond threshold
        const deltaX = Math.abs(clientX - startPos.current.x);
        const deltaY = Math.abs(clientY - startPos.current.y);

        if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
            hasMoved.current = true;
        }

        // Only update position if we've actually moved
        if (hasMoved.current) {
            const buttonSize = 56;
            const padding = 10;

            let newRight = window.innerWidth - clientX - buttonSize / 2;
            let newBottom = window.innerHeight - clientY - buttonSize / 2;

            newRight = Math.max(padding, Math.min(newRight, window.innerWidth - buttonSize - padding));
            newBottom = Math.max(padding, Math.min(newBottom, window.innerHeight - buttonSize - padding));

            setPosition({ right: newRight, bottom: newBottom });
        }
    }, [isDragging]);

    // Handle mouse/touch up
    const handleDragEnd = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);

            // Only save position if we actually moved (dragged)
            if (hasMoved.current) {
                savePosition(position);
            }
        }
    }, [isDragging, position, savePosition]);

    // Add global event listeners for drag
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('mouseup', handleDragEnd);
            document.addEventListener('touchmove', handleDragMove, { passive: false });
            document.addEventListener('touchend', handleDragEnd);

            return () => {
                document.removeEventListener('mousemove', handleDragMove);
                document.removeEventListener('mouseup', handleDragEnd);
                document.removeEventListener('touchmove', handleDragMove);
                document.removeEventListener('touchend', handleDragEnd);
            };
        }
    }, [isDragging, handleDragMove, handleDragEnd]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => {
                const buttonSize = 56;
                const padding = 10;
                const maxRight = window.innerWidth - buttonSize - padding;
                const maxBottom = window.innerHeight - buttonSize - padding;

                return {
                    right: Math.min(prev.right, maxRight),
                    bottom: Math.min(prev.bottom, maxBottom)
                };
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Handle click event - only fire if not dragged
    const handleClick = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();

        // Only refresh if we didn't move (pure click/tap)
        if (!hasMoved.current && !isRefreshing) {
            setIsRefreshing(true);

            // Trigger soft refresh through context
            setTimeout(() => {
                triggerRefresh();
                setIsRefreshing(false);
            }, 300);
        }
    }, [triggerRefresh, isRefreshing]);

    return (
        <button
            ref={buttonRef}
            className={`refresh-button ${isDragging ? 'dragging' : ''} ${isRefreshing ? 'refreshing' : ''}`}
            style={{
                right: `${position.right}px`,
                bottom: `${position.bottom}px`,
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            onClick={handleClick}
            title="Refresh Page (Drag to move)"
            aria-label="Refresh Page"
        >
            <svg
                className="refresh-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
        </button>
    );
};

export default RefreshButton;
