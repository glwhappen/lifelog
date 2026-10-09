import { describe, expect, it } from 'vitest';
import {
  categorize,
  classifyCapture,
  extractAmount,
  extractDay,
  parseMetric,
} from '@/lib/tools';
import { shiftDay, todayIn } from '@/lib/dates';

const SH = 'Asia/Shanghai';
const today = todayIn(SH);

describe('extractAmount —— 只认带货币标记的金额', () => {
  it('识别常见写法', () => {
    expect(extractAmount('午饭 35 元')).toBe(35);
    expect(extractAmount('打车 28.5 元')).toBe(28.5);
    expect(extractAmount('买了个键盘 399块')).toBe(399);
    expect(extractAmount('收到 ¥1200')).toBe(1200);
    expect(extractAmount('充话费 100 块钱')).toBe(100);
  });

  it('带花钱动词但没有货币标记时也认', () => {
    expect(extractAmount('花了 42')).toBe(42);
    expect(extractAmount('付了88')).toBe(88);
  });

  it('不会把运动/体重/时长当成花钱（回归测试）', () => {
    expect(extractAmount('跑步 5 公里')).toBeNull();
    expect(extractAmount('体重 70.5 公斤')).toBeNull();
    expect(extractAmount('专注 45 分钟')).toBeNull();
    expect(extractAmount('睡了 7.5 小时')).toBeNull();
  });

  it('没有数字时返回 null', () => {
    expect(extractAmount('今天天气不错')).toBeNull();
    expect(extractAmount('')).toBeNull();
  });

  it('0 元不算有效金额（记「花了 0 元」没有意义）', () => {
    expect(extractAmount('花了 0 元')).toBeNull();
    expect(extractAmount('0 元')).toBeNull();
  });
});

describe('extractDay —— 从整句里抽日期', () => {
  it('相对天', () => {
    expect(extractDay('明天要交周报', SH)).toBe(shiftDay(today, 1));
    expect(extractDay('今天把活干完', SH)).toBe(today);
    expect(extractDay('后天开会', SH)).toBe(shiftDay(today, 2));
    expect(extractDay('昨天买的', SH)).toBe(shiftDay(today, -1));
  });

  it('周几与下周', () => {
    const w = extractDay('周三交材料', SH)!;
    expect(new Date(`${w}T12:00:00Z`).getUTCDay()).toBe(3);
    const nw = extractDay('下周三交材料', SH)!;
    expect(new Date(`${nw}T12:00:00Z`).getUTCDay()).toBe(3);
    expect(new Date(`${nw}T12:00:00Z`).getTime()).toBeGreaterThan(new Date(`${w}T12:00:00Z`).getTime());
  });

  it('月日', () => {
    expect(extractDay('12月25日 圣诞', SH)).toBe(`${today.slice(0, 4)}-12-25`);
    expect(extractDay('3月5号体检', SH)).toBe(`${today.slice(0, 4)}-03-05`);
  });

  it('没有日期线索时返回 undefined（区别于回退今天）', () => {
    expect(extractDay('记一笔午饭', SH)).toBeUndefined();
  });
});

describe('parseMetric —— 数值指标识别', () => {
  it('体重', () => {
    expect(parseMetric('体重 70.5 公斤')).toEqual({ kind: 'weight', value: 70.5, unit: 'kg' });
    expect(parseMetric('称重 68kg')).toMatchObject({ kind: 'weight', value: 68, unit: 'kg' });
  });

  it('睡眠', () => {
    expect(parseMetric('睡了 7.5 小时')).toMatchObject({ kind: 'sleep', value: 7.5 });
    expect(parseMetric('睡眠 6 小时')).toMatchObject({ kind: 'sleep', value: 6 });
  });

  it('饮水', () => {
    expect(parseMetric('喝了 3 杯水')).toMatchObject({ kind: 'water', value: 3 });
    expect(parseMetric('喝水 500ml')).toMatchObject({ kind: 'water', value: 500 });
  });

  it('运动：距离优先于时长', () => {
    expect(parseMetric('跑步 5 公里')).toMatchObject({ kind: 'workout', value: 5, unit: 'km' });
    expect(parseMetric('运动 30 分钟')).toMatchObject({ kind: 'workout', value: 30, unit: '分钟' });
    expect(parseMetric('骑车 12km')).toMatchObject({ kind: 'workout', value: 12, unit: 'km' });
  });

  it('专注与阅读', () => {
    expect(parseMetric('专注 45 分钟')).toMatchObject({ kind: 'focus', value: 45 });
    expect(parseMetric('看书 30 分钟')).toMatchObject({ kind: 'reading', value: 30 });
    expect(parseMetric('阅读 20 页')).toMatchObject({ kind: 'reading', value: 20, unit: '页' });
  });

  it('心情分', () => {
    expect(parseMetric('心情 4')).toMatchObject({ kind: 'mood', value: 4 });
    expect(parseMetric('心情4/5')).toMatchObject({ kind: 'mood', value: 4 });
  });

  it('认不出来的返回 null', () => {
    expect(parseMetric('今天有点累')).toBeNull();
    expect(parseMetric('午饭 35 元')).toBeNull();
  });
});

describe('categorize —— 支出分类', () => {
  const cases: Array<[string, string]> = [
    ['午饭 35 元', '餐饮'],
    ['晚上吃火锅', '餐饮'],
    ['买了一杯咖啡', '餐饮'],
    ['打车回家', '交通'],
    ['地铁 5 元', '交通'],
    ['加油 300', '交通'],
    ['房租 3000', '居住'],
    ['水费电费', '居住'],
    ['买了件衣服', '购物'],
    ['超市采购', '购物'],
    ['买水果', '购物'],
    ['买药', '医疗'],
    ['看电影 45', '娱乐'],
    ['买书 60', '学习'],
    ['随礼 500', '人情'],
  ];
  for (const [text, want] of cases) {
    it(`「${text}」→ ${want}`, () => {
      expect(categorize(text)).toBe(want);
    });
  }

  it('认不出来时给「未分类」而不是乱猜', () => {
    expect(categorize('asdfgh')).toBe('未分类');
  });
});

describe('classifyCapture —— 整句分流', () => {
  it('金额优先：句子同时含「要」和金额时按记账处理', () => {
    expect(classifyCapture('午饭 35 元')).toMatchObject({ routed: 'expense', amount: 35, category: '餐饮' });
    expect(classifyCapture('要交房租 3000 元')).toMatchObject({ routed: 'expense', amount: 3000, category: '居住' });
  });

  it('收入识别', () => {
    expect(classifyCapture('收到报销 800 元')).toMatchObject({ routed: 'income', amount: 800 });
    expect(classifyCapture('发工资了 19472 元')).toMatchObject({ routed: 'income' });
    expect(classifyCapture('退款 50 元')).toMatchObject({ routed: 'income' });
  });

  it('数值指标', () => {
    expect(classifyCapture('跑步 5 公里')).toMatchObject({ routed: 'metric', kind: 'workout', value: 5 });
    expect(classifyCapture('体重 70.5 公斤')).toMatchObject({ routed: 'metric', kind: 'weight' });
    expect(classifyCapture('喝水 3 杯')).toMatchObject({ routed: 'metric', kind: 'water' });
  });

  it('待办意图', () => {
    expect(classifyCapture('明天要交周报')).toMatchObject({ routed: 'task' });
    expect(classifyCapture('记得买牛奶')).toMatchObject({ routed: 'task' });
    expect(classifyCapture('提醒我明天开会')).toMatchObject({ routed: 'task' });
  });

  it('灵感 / 完成 / 笔记', () => {
    expect(classifyCapture('灵感: 做一个生活记录站')).toMatchObject({ routed: 'idea' });
    expect(classifyCapture('想法：用 GPX 生成旅行日记')).toMatchObject({ routed: 'idea' });
    expect(classifyCapture('做完了 修复登录问题')).toMatchObject({ routed: 'done' });
    expect(classifyCapture('今天天气一般，啥也没干')).toMatchObject({ routed: 'note' });
  });

  it('兜底是 note，绝不会丢内容', () => {
    for (const s of ['随便一句话', '？？？', 'a']) {
      expect(classifyCapture(s).routed).toBe('note');
    }
  });

  it('每一条都能归类，返回值永远有 routed 字段', () => {
    const samples = [
      '午饭 35 元', '跑步 5 公里', '明天要交周报', '灵感: 做个东西',
      '收到红包 200 元', '体重 70', '心情 4', '今天很累', '',
    ];
    for (const s of samples) {
      const d = classifyCapture(s);
      expect(typeof d.routed).toBe('string');
      expect(d.routed.length).toBeGreaterThan(0);
    }
  });
});
