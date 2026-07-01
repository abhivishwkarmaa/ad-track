const SVG_PROPS = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
};

function Icon({ children, size = 18, className = '', style = {} }) {
    return (
        <svg
            {...SVG_PROPS}
            className={className}
            style={{ width: size, height: size, flexShrink: 0, ...style }}
        >
            {children}
        </svg>
    );
}

export const SearchIcon = (props) => (
    <Icon {...props}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
);

export const ClearIcon = (props) => (
    <Icon {...props}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
);

export const EyeIcon = (props) => (
    <Icon {...props}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </Icon>
);

export const PlusIcon = (props) => (
    <Icon {...props}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
);

export const EditIcon = (props) => (
    <Icon {...props}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Icon>
);

export const TrashIcon = (props) => (
    <Icon {...props}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </Icon>
);

export const AlertIcon = (props) => (
    <Icon size={40} {...props}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
);

export const PauseIcon = (props) => (
    <Icon {...props}>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
    </Icon>
);

export const PlayIcon = (props) => (
    <Icon {...props}>
        <polygon points="5 3 19 12 5 21 5 3" />
    </Icon>
);

export const CopyIcon = (props) => (
    <Icon {...props}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </Icon>
);

export const LinkIcon = (props) => (
    <Icon {...props}>
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </Icon>
);

export const ChevronIcon = ({ isOpen, ...props }) => (
    <Icon
        {...props}
        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', ...props.style }}
    >
        <polyline points="6 9 12 15 18 9" />
    </Icon>
);

export const RefreshIcon = (props) => (
    <Icon {...props}>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </Icon>
);
