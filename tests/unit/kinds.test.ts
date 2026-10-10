import { describe, expect, it } from 'vitest';
import { KIND_META, kindLabel, kindMeta, metricText } from '@/lib/kinds';
import { ENTRY_KINDS } from '@/lib/types';

describe('kinds —— 流水类型元数据', () => {
  it('每个声明的 kind 都有中文名与图标（新增类型忘了配映射会在这里挂）', () => {
    for (const k of ENTRY_KINDS) {
      expect(KIND_META[k], `缺少 ${k} 的展示元数据`).toBeDefined();
      expect(kindMeta(k).label).not.toBe(k);
      expect(kindMeta(k).emoji.length).toBeGreaterThan(0);
    }
  });

  it('未知类型不会崩，退回原始名', () => {
    expect(kindMeta('something_new')).toEqual({ emoji: '•', label: 'something_new' });
    expect(kindLabel('something_new')).toBe('something_new');
  });

  it('常见类型的中文名正确', () => {
    expect(kindLabel('expense')).toBe('支出');
    expect(kindLabel('income')).toBe('收入');
    expect(kindLabel('idea')).toBe('灵感');
    expect(kindLabel('note')).toBe('记录');
    expect(kindLabel('workout')).toBe('运动');
    expect(kindLabel('sleep')).toBe('睡眠');
    expect(kindLabel('gratitude')).toBe('感恩');
  });

  it('数值型标记正确（时间轴据此决定要不要隐藏重复的单位标签）', () => {
    for (const k of ['weight', 'sleep', 'water', 'workout', 'focus', 'mood', 'energy', 'reading']) {
      expect(KIND_META[k].numeric, `${k} 应该是数值型`).toBe(true);
    }
    for (const k of ['note', 'idea', 'expense', 'gratitude', 'social']) {
      expect(Boolean(KIND_META[k].numeric), `${k} 不是数值型`).toBe(false);
    }
  });
});

describe('metricText —— 数值 + 单位', () => {
  it('优先用显式单位，其次 meta.unit，最后用类型默认单位', () => {
    expect(metricText('weight', 70.5, 'kg')).toBe('70.5kg');
    expect(metricText('weight', 70.5, null, { unit: 'kg' })).toBe('70.5kg');
    expect(metricText('weight', 70.5)).toBe('70.5kg'); // 类型默认
    expect(metricText('sleep', 7.5)).toBe('7.5小时');
    expect(metricText('water', 6)).toBe('6杯');
  });

  it('没有值时返回空串（而不是 "null"）', () => {
    expect(metricText('weight', null)).toBe('');
    expect(metricText('weight', null, 'kg')).toBe('');
  });

  it('0 是有效值，不能被当成空', () => {
    expect(metricText('water', 0)).toBe('0杯');
  });

  it('自定义类型没有默认单位也不报错', () => {
    expect(metricText('some_metric', 42)).toBe('42');
  });
});
