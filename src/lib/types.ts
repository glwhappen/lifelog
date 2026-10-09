/** 领域类型。字段与 migrations/001_init.sql 一一对应。 */

export const ENTRY_KINDS = [
  'done',
  'idea',
  'note',
  'expense',
  'income',
  'mood',
  'energy',
  'sleep',
  'weight',
  'water',
  'workout',
  'focus',
  'reading',
  'gratitude',
  'dream',
  'social',
  'weather',
  'location',
  'metric',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export interface Entry {
  id: number;
  user_id: string;
  kind: string;
  day: string;
  happened_at: string;
  title: string | null;
  content: string | null;
  amount: number | null;
  currency: string;
  category: string | null;
  tags: string[];
  source: string;
  meta: Record<string, any>;
  task_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Task {
  id: number;
  user_id: string;
  title: string;
  note: string | null;
  status: 'pending' | 'done' | 'cancelled';
  priority: number;
  planned_day: string | null;
  due_day: string | null;
  done_at: string | null;
  tags: string[];
  parent_id: number | null;
  sort: number;
  source: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Habit {
  id: number;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: 'bool' | 'count';
  target: number | null;
  unit: string | null;
  freq: string;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  user_id: string;
  day: string;
  value: number;
  note: string | null;
  created_at: string;
}

export interface LocationRow {
  id: number;
  user_id: string;
  day: string;
  happened_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  place_name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  source: string;
  entry_id: number | null;
  created_at: string;
}

export interface DailySummary {
  id: number;
  user_id: string;
  day: string;
  mood: number | null;
  energy: number | null;
  summary: string | null;
  ai_summary: string | null;
  ai_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: number;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}
