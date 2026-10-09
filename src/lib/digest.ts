import { eachDay, resolveRange } from './dates';
import { getDay } from './day';
import { overview } from './stats';
import { listTasks } from './tasks';

const KIND_LABEL: Record<string, string> = {
  idea: '💡 灵感',
  note: '📝 记录',
  done: '✅ 完成',
  expense: '💸 支出',
  income: '💰 收入',
  mood: '🙂 心情',
  energy: '⚡ 精力',
  sleep: '😴 睡眠',
  weight: '⚖️ 体重',
  water: '💧 饮水',
  workout: '🏃 运动',
  focus: '🎯 专注',
  reading: '📖 阅读',
  gratitude: '🙏 感恩',
  dream: '🌙 梦境',
  social: '👥 社交',
  weather: '⛅ 天气',
  location: '📍 位置',
  metric: '📊 指标',
};

function money(n: number) {
  return `¥${Number(n).toFixed(2)}`;
}

function entryLine(e: { kind: string; title: string | null; content: string | null; amount: number | null; category: string | null; happened_at: string; meta: any }): string {
  const t = e.happened_at ? new Date(e.happened_at).toISOString().slice(11, 16) : '';
  const parts: string[] = [];
  const text = [e.title, e.content].filter(Boolean).join(' ');
  if (e.kind === 'expense' || e.kind === 'income') {
    parts.push(`${money(Number(e.amount ?? 0))}${e.category ? ` [${e.category}]` : ''} ${text}`.trim());
  } else if (e.amount !== null && e.amount !== undefined && e.kind !== 'done') {
    const unit = e.category ?? e.meta?.unit ?? '';
    parts.push(`${e.amount}${unit} ${text}`.trim());
  } else {
    parts.push(text);
  }
  return `- ${t} ${parts.join('')}`.trimEnd();
}

/**
 * 把一段时间的生活导出成紧凑 Markdown —— 这是喂给大模型的「我这一周」。
 * 目标：信息密度高、无冗余表格、不需要模型再猜。
 */
export async function digest(
  userId: string,
  tz: string,
  range: { from?: unknown; to?: unknown; days?: unknown; range?: unknown },
  opts: { days?: number } = {},
): Promise<string> {
  const { from, to } = resolveRange(range, tz);
  const all = eachDay(from, to);
  const list = all.slice(-(opts.days ?? 31));

  const lines: string[] = [];
  lines.push(`# 生活记录 ${from} ~ ${to}`);
  lines.push('');

  const ov = await overview(userId, tz, { from, to });
  lines.push('## 区间概览');
  lines.push(
    `- 有记录天数：${ov.activeDays}/${ov.totalDays}　总条目：${ov.entries}`,
  );
  lines.push(`- 任务：新建 ${ov.tasks.created}，完成 ${ov.tasks.done}（完成率 ${(ov.tasks.rate * 100).toFixed(0)}%）`);
  lines.push(`- 收支：支出 ${money(ov.finance.expense)}，收入 ${money(ov.finance.income)}，净额 ${money(ov.finance.net)}`);
  if (ov.habits.length) {
    const hs = ov.habits
      .map((h) => `${h.name} ${h.doneDays}/${h.totalDays}天(连续${h.currentStreak})`)
      .join('、');
    lines.push(`- 习惯：${hs}`);
  }
  if (ov.metrics.length) {
    const ms = ov.metrics
      .map((m) => `${KIND_LABEL[m.kind]?.replace(/^\S+\s/, '') ?? m.kind} 最近${m.last}${m.unit ?? ''}（均值${m.avg ?? '-'}，n=${m.n}）`)
      .join('；');
    lines.push(`- 指标：${ms}`);
  }
  if (ov.finance.byCategory.length) {
    lines.push(
      `- 支出构成：${ov.finance.byCategory.map((c) => `${c.key} ${money(c.expense)}`).join('、')}`,
    );
  }
  lines.push('');

  lines.push('## 逐日明细');
  for (const day of list) {
    const d = await getDay(userId, tz, day);
    const doneTitles = d.tasks.done.map((t) => t.title);
    const pendingTitles = d.tasks.planned.map((t) => t.title);
    const hasContent =
      doneTitles.length ||
      pendingTitles.length ||
      Object.keys(d.entries).length ||
      d.finance.items.length ||
      d.locations.length ||
      d.summary?.summary;
    if (!hasContent) continue;

    lines.push('');
    lines.push(`### ${day}`);
    if (d.summary?.mood || d.summary?.energy) {
      lines.push(`- 心情 ${d.summary.mood ?? '-'}/5，精力 ${d.summary.energy ?? '-'}/5`);
    }
    if (doneTitles.length) lines.push(`- 完成：${doneTitles.join('、')}`);
    if (pendingTitles.length) lines.push(`- 未完成待办：${pendingTitles.join('、')}`);

    for (const [kind, items] of Object.entries(d.entries)) {
      if (!items.length) continue;
      lines.push(`- ${KIND_LABEL[kind] ?? kind}`);
      for (const e of items.slice(0, 40)) lines.push(`  ${entryLine(e as any)}`);
    }

    if (d.finance.items.length) {
      lines.push(`- 当日收支：支出 ${money(d.finance.expense)}，收入 ${money(d.finance.income)}`);
    }
    const places = [...new Set(d.locations.map((l) => l.place_name || l.city).filter(Boolean))];
    if (places.length) lines.push(`- 到过：${places.slice(0, 8).join(' → ')}`);
    const habitDone = d.habits.filter((h) => h.done).map((h) => h.name);
    if (habitDone.length) lines.push(`- 打卡：${habitDone.join('、')}`);
    if (d.summary?.summary) lines.push(`- 当天总结：${d.summary.summary.replace(/\n/g, ' ')}`);
  }

  lines.push('');
  lines.push('## 待办现状');
  const pending = await listTasks(userId, tz, { state: 'pending', limit: 60 });
  if (!pending.length) lines.push('- （当前没有未完成待办）');
  for (const t of pending) {
    const due = t.planned_day ? `（计划 ${t.planned_day}）` : t.due_day ? `（截止 ${t.due_day}）` : '';
    lines.push(`- [ ] ${t.title}${due}${t.priority >= 2 ? ' ‼️' : t.priority === 1 ? ' ❗' : ''}`);
  }
  return lines.join('\n');
}
