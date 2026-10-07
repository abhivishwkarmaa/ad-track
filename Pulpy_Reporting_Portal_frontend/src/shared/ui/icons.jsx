import React from 'react';
import {
    Search,
    X,
    Eye,
    Plus,
    Edit2,
    Trash2,
    AlertTriangle,
    Pause,
    Play,
    Copy,
    Link as LucideLink,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    RefreshCw,
    ArrowLeft,
    ExternalLink,
    Check,
    CheckCircle2,
    FileText,
    Wallet,
    TrendingUp,
    CreditCard,
    Zap,
    Clock,
    Target,
    Globe,
    Smartphone,
    Monitor,
    Shield,
    Info,
    CircleSlash,
    DollarSign,
    Shuffle,
    Users,
    User,
    Building2,
    MousePointerClick,
    Percent,
    Lock,
    Phone,
    Share2,
    Menu,
    LayoutDashboard,
    Tag,
    Briefcase,
    CheckSquare,
    BarChart3,
    Send,
    LogOut,
    Mail,
    Bell,
    Calendar,
    List,
    Filter,
    Download,
    Upload,
    Activity,
    CheckCheck,
} from 'lucide-react';

const wrapIcon = (Component, defaultSize = 18) => {
    const WrappedIcon = ({ size = defaultSize, className = '', style = {}, ...props }) => (
        <Component
            size={size}
            className={className}
            style={{ flexShrink: 0, ...style }}
            {...props}
        />
    );
    WrappedIcon.displayName = Component.displayName || Component.name || 'LucideIcon';
    return WrappedIcon;
};

// Generic Icon compatibility wrapper
export const Icon = ({ children, size = 18, className = '', style = {}, viewBox = '0 0 24 24', ...props }) => {
    if (React.isValidElement(children)) {
        return React.cloneElement(children, {
            size,
            className: `${children.props.className || ''} ${className}`.trim(),
            style: { flexShrink: 0, ...children.props.style, ...style },
            ...props,
        });
    }
    return (
        <svg
            viewBox={viewBox}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={{ width: size, height: size, flexShrink: 0, ...style }}
            {...props}
        >
            {children}
        </svg>
    );
};

// Core Lucide Icons mapping for clean app-wide consumption
export const SearchIcon = wrapIcon(Search);
export const ClearIcon = wrapIcon(X);
export const EyeIcon = wrapIcon(Eye);
export const PlusIcon = wrapIcon(Plus);
export const EditIcon = wrapIcon(Edit2);
export const TrashIcon = wrapIcon(Trash2);
export const AlertIcon = wrapIcon(AlertTriangle, 20);
export const PauseIcon = wrapIcon(Pause);
export const PlayIcon = wrapIcon(Play);
export const CopyIcon = wrapIcon(Copy);
export const LinkIcon = wrapIcon(LucideLink);
export const ChevronIcon = ({ isOpen, size = 18, style = {}, ...props }) => (
    <ChevronDown
        size={size}
        style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
            ...style,
        }}
        {...props}
    />
);
export const RefreshIcon = wrapIcon(RefreshCw);
export const ArrowLeftIcon = wrapIcon(ArrowLeft);
export const ExternalLinkIcon = wrapIcon(ExternalLink);
export const CheckIcon = wrapIcon(Check);
export const CheckCircleIcon = wrapIcon(CheckCircle2);
export const CloseIcon = wrapIcon(X);
export const XIcon = wrapIcon(X);
export const DocumentIcon = wrapIcon(FileText);
export const WalletIcon = wrapIcon(Wallet);
export const TrendingUpIcon = wrapIcon(TrendingUp);
export const CreditCardIcon = wrapIcon(CreditCard);
export const ZapIcon = wrapIcon(Zap);
export const ClockIcon = wrapIcon(Clock);
export const TargetIcon = wrapIcon(Target);
export const GlobeIcon = wrapIcon(Globe);
export const MobileIcon = wrapIcon(Smartphone);
export const MonitorIcon = wrapIcon(Monitor);
export const ShieldIcon = wrapIcon(Shield);
export const InfoIcon = wrapIcon(Info);
export const CircleSlashIcon = wrapIcon(CircleSlash);
export const DollarIcon = wrapIcon(DollarSign);
export const ShuffleIcon = wrapIcon(Shuffle);
export const UsersIcon = wrapIcon(Users);
export const UserIcon = wrapIcon(User);
export const BuildingIcon = wrapIcon(Building2);
export const ClickIcon = wrapIcon(MousePointerClick);
export const ConversionIcon = wrapIcon(TrendingUp);
export const RevenueIcon = wrapIcon(DollarSign);
export const RateIcon = wrapIcon(Percent);
export const CrIcon = wrapIcon(Percent);
export const PayoutIcon = wrapIcon(Wallet);
export const ProfitIcon = wrapIcon(TrendingUp);
export const RejectedIcon = wrapIcon(CircleSlash);
export const ExpiredIcon = wrapIcon(Clock);
export const LockIcon = wrapIcon(Lock);
export const PhoneIcon = wrapIcon(Phone);
export const ShareIcon = wrapIcon(Share2);
export const MenuIcon = wrapIcon(Menu);
export const DashboardIcon = wrapIcon(LayoutDashboard);
export const OfferIcon = wrapIcon(Tag);
export const AffiliateIcon = wrapIcon(Users);
export const AdvertiserIcon = wrapIcon(Briefcase);
export const AssignmentIcon = wrapIcon(CheckSquare);
export const ReportsIcon = wrapIcon(BarChart3);
export const PostbackIcon = wrapIcon(Send);
export const AccountIcon = wrapIcon(User);
export const LogoutIcon = wrapIcon(LogOut);
export const TenantIcon = wrapIcon(Building2);
export const ContactIcon = wrapIcon(Mail);
export const ChevronRightIcon = wrapIcon(ChevronRight);
export const BellIcon = wrapIcon(Bell);
export const CalendarIcon = wrapIcon(Calendar);
export const ListIcon = wrapIcon(List);
export const FilterIcon = wrapIcon(Filter);
export const DownloadIcon = wrapIcon(Download);
export const UploadIcon = wrapIcon(Upload);
export const LiveLogsIcon = wrapIcon(Activity);
export const ChevronDownIcon = wrapIcon(ChevronDown);
export const ChevronUpIcon = wrapIcon(ChevronUp);
export const ApproveIcon = wrapIcon(CheckCheck);
