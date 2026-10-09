/**
 * 流水类型的展示元数据（图标 + 中文名）。
 * 单一事实源：前端页面、Markdown 导出都从这里取，避免出现三份不一致的映射表。
 */
export interface KindMeta {
  icon: string;
  label: string;
  /** 该类型是否以数值为主（时间轴右侧显示数值而非金额） */
  numeric?: boolean;
  /** 数值型默认单位（没有显式 unit 时兜底） */
  unit?: string;
}

export const KIND_META: Record<string, KindMeta> = {
  done: { icon: '✅', label: '完成' },
  idea: { icon: '💡', label: '灵感' },
  note: { icon: '📝', label: '记录' },
  expense: { icon: '💸', label: '支出' },
  income: { icon: '💰', label: '收入' },
  mood: { icon: '🙂', label: '心情', numeric: true, unit: '/5' },
  energy: { icon: '⚡', label: '精力', numeric: true, unit: '/5' },
  sleep: { icon: '😴', label: '睡眠', numeric: true, unit: '小时' },
  weight: { icon: '⚖️', label: '体重', numeric: true, unit: 'kg' },
  water: { icon: '💧', label: '饮水', numeric: true, unit: '杯' },
  workout: { icon: '🏃', label: '运动', numeric: true, unit: 'km' },
  focus: { icon: '🎯', label: '专注', numeric: true, unit: '分钟' },
  reading: { icon: '📖', label: '阅读', numeric: true, unit: '分钟' },
  gratitude: { icon: '🙏', label: '感恩' },
  dream: { icon: '🌙', label: '梦境' },
  social: { icon: '👥', label: '社交' },
  weather: { icon: '⛅', label: '天气' },
  location: { icon: '📍', label: '位置' },
  metric: { icon: '📊', label: '指标', numeric: true },
};

export function kindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? { icon: '•', label: kind };
}

export function kindLabel(kind: string): string {
  return kindMeta(kind).label;
}

/** 数值 + 单位 → 展示文本，如 70.5kg / 6/5 */
export function metricText(kind: string, amount: number | null, unit?: string | null, meta?: any): string {
  if (amount === null || amount === undefined) return '';
  const u = unit || meta?.unit || kindMeta(kind).unit || '';
  return `${amount}${u}`;
}
