/**
 * 流水类型的展示元数据（中文名 + 文本标记）。
 * 单一事实源：前端页面、Markdown 导出都从这里取，避免出现三份不一致的映射表。
 *
 * 注意：`emoji` 只用于**纯文本**场景（Markdown 导出、日志、给模型看的摘要）——
 * 那里放不了 SVG。界面上一律用 <KindIcon>（lucide 线性图标）。
 */
export interface KindMeta {
  /** 纯文本场景的字符标记；界面请用 KindIcon */
  emoji: string;
  label: string;
  /** 该类型是否以数值为主（时间轴右侧显示数值而非金额） */
  numeric?: boolean;
  /** 数值型默认单位（没有显式 unit 时兜底） */
  unit?: string;
}

export const KIND_META: Record<string, KindMeta> = {
  done: { emoji: '✅', label: '完成' },
  idea: { emoji: '💡', label: '灵感' },
  note: { emoji: '📝', label: '记录' },
  expense: { emoji: '💸', label: '支出' },
  income: { emoji: '💰', label: '收入' },
  mood: { emoji: '🙂', label: '心情', numeric: true, unit: '/5' },
  energy: { emoji: '⚡', label: '精力', numeric: true, unit: '/5' },
  sleep: { emoji: '😴', label: '睡眠', numeric: true, unit: '小时' },
  weight: { emoji: '⚖️', label: '体重', numeric: true, unit: 'kg' },
  water: { emoji: '💧', label: '饮水', numeric: true, unit: '杯' },
  workout: { emoji: '🏃', label: '运动', numeric: true, unit: 'km' },
  focus: { emoji: '🎯', label: '专注', numeric: true, unit: '分钟' },
  reading: { emoji: '📖', label: '阅读', numeric: true, unit: '分钟' },
  gratitude: { emoji: '🙏', label: '感恩' },
  dream: { emoji: '🌙', label: '梦境' },
  social: { emoji: '👥', label: '社交' },
  weather: { emoji: '⛅', label: '天气' },
  location: { emoji: '📍', label: '位置' },
  metric: { emoji: '📊', label: '指标', numeric: true },
};

export function kindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? { emoji: '•', label: kind };
}

export function kindLabel(kind: string): string {
  return kindMeta(kind).label;
}

/** 数值 + 单位 → 展示文本，如 70.5kg / 6杯 */
export function metricText(kind: string, amount: number | null, unit?: string | null, meta?: any): string {
  if (amount === null || amount === undefined) return '';
  const u = unit || meta?.unit || kindMeta(kind).unit || '';
  return `${amount}${u}`;
}
