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

export const XIcon = (props) => (
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

export const ArrowLeftIcon = (props) => (
    <Icon {...props}>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </Icon>
);

export const CheckIcon = (props) => (
    <Icon {...props}>
        <polyline points="20 6 9 17 4 12" />
    </Icon>
);

export const ShareIcon = (props) => (
    <Icon {...props}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.7" y1="10.7" x2="15.3" y2="6.3" />
        <line x1="8.7" y1="13.3" x2="15.3" y2="17.7" />
    </Icon>
);

export const ExternalLinkIcon = (props) => (
    <Icon {...props}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
);

export const ClickIcon = (props) => (
    <Icon {...props}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
);

export const ConversionIcon = (props) => (
    <Icon {...props}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </Icon>
);

export const RevenueIcon = (props) => (
    <Icon {...props}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </Icon>
);

export const RateIcon = (props) => (
    <Icon {...props}>
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
);

export const DocumentIcon = (props) => (
    <Icon {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
    </Icon>
);

export const WalletIcon = (props) => (
    <Icon {...props}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M7 15h0M2 10h20" />
    </Icon>
);

export const ShieldIcon = (props) => (
    <Icon {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
);

export const TargetIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
    </Icon>
);

export const GlobeIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Icon>
);

export const MobileIcon = (props) => (
    <Icon {...props}>
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
    </Icon>
);

export const MonitorIcon = (props) => (
    <Icon {...props}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
    </Icon>
);

export const ZapIcon = (props) => (
    <Icon {...props}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
);

export const InfoIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </Icon>
);

export const BuildingIcon = (props) => (
    <Icon {...props}>
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="9" y1="22" x2="9" y2="18" />
        <line x1="15" y1="22" x2="15" y2="18" />
        <line x1="9" y1="6" x2="9.01" y2="6" />
        <line x1="15" y1="6" x2="15.01" y2="6" />
        <line x1="9" y1="10" x2="9.01" y2="10" />
        <line x1="15" y1="10" x2="15.01" y2="10" />
        <line x1="9" y1="14" x2="9.01" y2="14" />
        <line x1="15" y1="14" x2="15.01" y2="14" />
    </Icon>
);

export const UserIcon = (props) => (
    <Icon {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </Icon>
);

export const UsersIcon = (props) => (
    <Icon {...props}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
);

export const TrendingUpIcon = (props) => (
    <Icon {...props}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </Icon>
);

export const ClockIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </Icon>
);

export const CircleSlashIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </Icon>
);
