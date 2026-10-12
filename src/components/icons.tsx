/**
 * 界面图标。
 *
 * 用 lucide（线性、24px 网格、stroke 统一）而不是 emoji：
 * emoji 在不同系统/浏览器上长得不一样（Apple / Google / Windows 三套），
 * 粗细和基线也对不齐，混排进标题和按钮里很乱。
 *
 * lucide 组件是纯 SVG + currentColor，跟着主题走，暗色也自然。
 */

import {
  Activity,
  Annoyed,
  Award,
  Baby,
  Briefcase,
  Cake,
  CalendarHeart,
  Car,
  Church,
  Flower2,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Hourglass,
  House,
  Milestone,
  PartyPopper,
  PawPrint,
  Plane,
  Sprout,
  Star,
  Trophy,
  ArrowRight,
  Bot,
  Frown,
  Laugh,
  Meh,
  CalendarDays,
  ChartNoAxesColumn,
  Clock,
  FileJson,
  Info,
  Plus,
  TrendingDown,
  TrendingUp,
  User,
  AlarmClock,
  Apple,
  Ban,
  BedDouble,
  Bike,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarClock,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Cigarette,
  CircleAlert,
  CircleCheck,
  CloudMoon,
  CloudSun,
  Coffee,
  Compass,
  Copy,
  Download,
  Droplets,
  Dumbbell,
  Ellipsis,
  ExternalLink,
  Flame,
  Footprints,
  Gauge,
  GlassWater,
  HeartHandshake,
  History,
  Inbox,
  KeyRound,
  Leaf,
  Lightbulb,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  MoonStar,
  Music,
  NotebookPen,
  Pencil,
  PersonStanding,
  PieChart,
  PiggyBank,
  Pill,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Sun,
  Sunrise,
  Tag,
  Target,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  Wallet,
  Wine,
  X,
  Zap,
} from 'lucide-react';

export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

type IconCmp = React.ComponentType<IconProps & { 'aria-hidden'?: boolean }>;

/* ---------------------------------------------------------------- 品牌 */

/** 与 public/favicon.svg 同一个图形，保证站点图标和界面里的一致 */
export function Logo({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={className}
      style={{ display: 'block', ...style }}
    >
      <path
        d="M32 14v20M32 34l9 6M32 34l-9 6"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

/* ---------------------------------------------------------------- 流水类型 */

const KIND_ICONS: Record<string, IconCmp> = {
  done: CircleCheck,
  idea: Lightbulb,
  note: NotebookPen,
  expense: Receipt,
  income: PiggyBank,
  mood: Smile,
  energy: Zap,
  sleep: BedDouble,
  weight: Scale,
  water: Droplets,
  workout: Dumbbell,
  focus: Target,
  reading: BookOpen,
  gratitude: HeartHandshake,
  dream: MoonStar,
  social: Users,
  weather: CloudSun,
  location: MapPin,
  metric: Gauge,
};

export function KindIcon({ kind, size = 15, strokeWidth = 2, className, style }: IconProps & { kind: string }) {
  const Cmp = KIND_ICONS[kind] ?? NotebookPen;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden />;
}

export function kindIconExists(kind: string): boolean {
  return kind in KIND_ICONS;
}

/* ---------------------------------------------------------------- 习惯 */

/**
 * 习惯图标库。存进数据库的是**键名**（如 `sunrise`），不是 emoji ——
 * 这样以后换图标集不用动数据。
 *
 * 兼容性：数据库里可能还留着早期版本的 emoji（如 `🌅`），
 * `HabitIcon` 认不出来时会把它当文本渲染，不会变成空白。
 */
export const HABIT_ICONS: Array<{ key: string; label: string; Icon: IconCmp }> = [
  { key: 'sunrise', label: '早起', Icon: Sunrise },
  { key: 'sun', label: '白天', Icon: Sun },
  { key: 'moon', label: '早睡', Icon: Moon },
  { key: 'alarm', label: '闹钟', Icon: AlarmClock },
  { key: 'bed', label: '睡眠', Icon: BedDouble },

  { key: 'dumbbell', label: '健身', Icon: Dumbbell },
  { key: 'run', label: '跑步', Icon: Footprints },
  { key: 'bike', label: '骑行', Icon: Bike },
  { key: 'activity', label: '运动', Icon: Activity },
  { key: 'stretch', label: '拉伸', Icon: PersonStanding },

  { key: 'water', label: '喝水', Icon: Droplets },
  { key: 'glass', label: '饮品', Icon: GlassWater },
  { key: 'apple', label: '饮食', Icon: Apple },
  { key: 'coffee', label: '咖啡', Icon: Coffee },
  { key: 'pill', label: '吃药', Icon: Pill },
  { key: 'scale', label: '体重', Icon: Scale },

  { key: 'book', label: '阅读', Icon: BookOpen },
  { key: 'pen', label: '写作', Icon: Pencil },
  { key: 'note', label: '复盘', Icon: NotebookPen },
  { key: 'brain', label: '学习', Icon: Brain },
  { key: 'music', label: '音乐', Icon: Music },
  { key: 'target', label: '专注', Icon: Target },

  { key: 'wallet', label: '记账', Icon: Wallet },
  { key: 'piggy', label: '储蓄', Icon: PiggyBank },
  { key: 'heart', label: '善意', Icon: HeartHandshake },
  { key: 'leaf', label: '冥想', Icon: Leaf },
  { key: 'sparkles', label: '自我照顾', Icon: Sparkles },
  { key: 'users', label: '社交', Icon: Users },
  { key: 'ban', label: '戒断', Icon: Ban },
  { key: 'cigarette', label: '戒烟', Icon: Cigarette },
  { key: 'wine', label: '戒酒', Icon: Wine },
];

const HABIT_ICON_MAP = new Map(HABIT_ICONS.map((h) => [h.key, h.Icon]));

/** 习惯图标：认识就用图标，不认识（例如旧的 emoji 数据）就原样当文本渲染 */
export function HabitIcon({ name, size = 15, className, style }: IconProps & { name: string | null | undefined }) {
  if (!name) return null;
  const Cmp = HABIT_ICON_MAP.get(name);
  if (Cmp) return <Cmp size={size} strokeWidth={2} className={className} style={style} aria-hidden />;
  // 老数据兜底：emoji 或任意文本
  return (
    <span style={{ fontSize: size - 1, lineHeight: 1, display: 'inline-block', ...style }} aria-hidden>
      {name}
    </span>
  );
}

/* ---------------------------------------------------------------- 纪念日 */

/**
 * 纪念日图标库。和习惯一样，数据库里存的是**键名**。
 * `CounterIcon` 认不出键名时退回默认的心形。
 */
export const COUNTER_ICONS: Array<{ key: string; label: string; Icon: IconCmp }> = [
  { key: 'heart', label: '纪念日', Icon: Heart },
  { key: 'gem', label: '结婚', Icon: Gem },
  { key: 'cake', label: '生日', Icon: Cake },
  { key: 'party', label: '庆祝', Icon: PartyPopper },
  { key: 'briefcase', label: '入职/离职', Icon: Briefcase },
  { key: 'baby', label: '孩子', Icon: Baby },
  { key: 'house', label: '搬家', Icon: House },
  { key: 'graduation', label: '毕业', Icon: GraduationCap },
  { key: 'plane', label: '旅行', Icon: Plane },
  { key: 'car', label: '买车', Icon: Car },
  { key: 'paw', label: '宠物', Icon: PawPrint },
  { key: 'flower', label: '植物', Icon: Flower2 },
  { key: 'sprout', label: '习惯起点', Icon: Sprout },
  { key: 'star', label: '里程碑', Icon: Star },
  { key: 'trophy', label: '成就', Icon: Trophy },
  { key: 'award', label: '荣誉', Icon: Award },
  { key: 'church', label: '仪式', Icon: Church },
  { key: 'gift', label: '礼物', Icon: Gift },
  { key: 'hourglass', label: '等待', Icon: Hourglass },
  { key: 'milestone', label: '节点', Icon: Milestone },
];

const COUNTER_ICON_MAP = new Map(COUNTER_ICONS.map((c) => [c.key, c.Icon]));

export function CounterIcon({ name, size = 16, className, style }: IconProps & { name?: string | null }) {
  const Cmp = (name ? COUNTER_ICON_MAP.get(name) : undefined) ?? Heart;
  return <Cmp size={size} strokeWidth={2} className={className} style={style} aria-hidden />;
}

/* ---------------------------------------------------------------- 界面常用 */

export const UI_ICONS = {
  todo: ListChecks,
  habit: Flame,
  finance: Wallet,
  timeline: History,
  stats: ChartLine,
  settings: Settings,
  today: CalendarCheck,
  edit: Pencil,
  ai: Sparkles,
  undo: Undo2,
  trash: Trash2,
  close: X,
  more: Ellipsis,
  copy: Copy,
  external: ExternalLink,
  warn: TriangleAlert,
  error: CircleAlert,
  info: ShieldCheck,
  download: Download,
  key: KeyRound,
  logout: LogOut,
  login: LogIn,
  empty: Inbox,
  compass: Compass,
  search: Search,
  refresh: RefreshCw,
  check: Check,
  prev: ChevronLeft,
  next: ChevronRight,
  clock: CalendarClock,
  location: MapPin,
};

/* ---------------------------------------------------------------- 转出 */
/* 页面直接从这里 import，保证图标来源唯一（不要各处 import lucide-react） */
export {
  Activity,
  Annoyed,
  ArrowRight,
  Award,
  Baby,
  BookOpen,
  Bot,
  Briefcase,
  Cake,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarHeart,
  Car,
  ChartLine,
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Church,
  Clock,
  CloudSun,
  Compass,
  Copy,
  Download,
  Droplets,
  Dumbbell,
  Ellipsis,
  ExternalLink,
  FileJson,
  Flame,
  Flower2,
  Frown,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  History,
  Hourglass,
  House,
  Inbox,
  Info,
  KeyRound,
  Laugh,
  Lightbulb,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Meh,
  Milestone,
  Moon,
  MoonStar,
  NotebookPen,
  PartyPopper,
  PawPrint,
  Pencil,
  PieChart,
  PiggyBank,
  Plane,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Undo2,
  User,
  Users,
  Wallet,
  X,
  Zap,

};

/** 心情/精力 1-5 的表情序列（线性图标版） */
export const MOOD_FACES = [Frown, Annoyed, Meh, Smile, Laugh];
