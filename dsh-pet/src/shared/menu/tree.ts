/**
 * 菜单树构建：从动画清单与第三方注册项拼出层级，并做镜像动画过滤。
 *
 * 不碰 DOM；输入是配置与注册数据，输出是纯对象树。
 * 必须始终成立：同一份输入必得同一棵树，层级顺序稳定。
 * @module dsh-pet/src/shared/menu/tree
 */
import { type Animations, type Category, type OutfitChoice } from '../types.ts';
import type { MenuBranch, MenuLeaf, MenuMoreItem, MenuNode } from './types.ts';

/** 「显示位置」子菜单：两端注入同一份，文案与设置页的显示位置下拉框一致。
 *  两端各写一份必然漂移，而这一项语义对称：桌面端用它把宠物送走，浏览器端用它送到桌面。
 *  「都不」是单向门（恢复入口是设置页），其余三个值都能从某一端改回来。 */
export const displayMenuBranch = (): MenuBranch => ({
  label: '显示位置',
  children: [
    { label: '仅网页', action: 'set-display', display: 'web' },
    { label: '仅桌面', action: 'set-display', display: 'desktop' },
    { label: '两者', action: 'set-display', display: 'both' },
    { label: '都不', action: 'set-display', display: 'none' },
  ],
});

/** 已安装形态的原生菜单。 */
export function outfitMenuBranch(choices?: OutfitChoice[]): MenuBranch | null {
  if (!choices || choices.length < 2) return null;
  return {
    label: '换装',
    children: choices.map((choice) => ({
      label: choice.label,
      action: 'set-outfit',
      outfit: choice.id,
      ...(choice.current ? { hint: '当前' } : {}),
    })),
  };
}

/** 第三方菜单项统一收在这个一级菜单下（宿主自己的菜单项不进这里）。 */
export const MORE_MENU_LABEL = '更多';

/** 从 /state 的 sections.menu.data 里读出本端要显示的第三方菜单项。
 *  target 等于本端身份或 both 才收；target 缺失或不认识时按 both 处理——老宿主没有这个字段，
 *  宁可在两端都显示，也不要让一个正在用的第三方菜单凭空消失。
 *  快照来自网络，字段一律按「可能不存在」处理：坏条目静默丢弃，不能让一条数据搞崩菜单。 */
export function readMenuItems(data: unknown, surface: 'web' | 'desktop'): MenuMoreItem[] {
  if (!data || typeof data !== 'object') return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: MenuMoreItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    // 端过滤：只认三个字面量，其余（缺失 / 写坏）一律当 both
    const rawTarget = rec.target;
    const target = rawTarget === 'web' || rawTarget === 'desktop' || rawTarget === 'both' ? rawTarget : 'both';
    if (target !== 'both' && target !== surface) continue;
    const owner = rec.owner;
    const label = rec.label;
    if (typeof owner === 'string' && owner !== '' && typeof label === 'string' && label !== '') {
      out.push({ owner, label });
    }
  }
  return out;
}

/** 「更多」一级菜单：把第三方菜单项拼成菜单树的一枝；没有第三方项时返回 null，菜单里不会出现空的「更多」。
 *  层级只按项数决定：某 owner 只有 1 项就直接平铺（少一次点击），2 项及以上才加 owner 这一层。
 *  同名不同 owner 的项允许共存，不做去重、编号或来源标注——文案由注册方负责。 */
export function buildMoreBranch(items: readonly MenuMoreItem[]): MenuBranch | null {
  // owner → 项名（Map 保序：注册顺序 = 分组顺序 = 组内顺序）
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const list = groups.get(item.owner);
    if (list) list.push(item.label);
    else groups.set(item.owner, [item.label]);
  }
  const children: MenuNode[] = [];
  for (const [owner, labels] of groups) {
    if (labels.length === 1) {
      children.push({ label: labels[0], action: 'third-party', owner });
    } else {
      children.push({
        label: owner,
        children: labels.map((label) => ({ label, action: 'third-party' as const, owner })),
      });
    }
  }
  return children.length > 0 ? { label: MORE_MENU_LABEL, children } : null;
}

/** 事件名 → 分类标签（无映射时用事件名本身）。 */
const EVENT_LABELS: Record<string, string> = {
  balance: '余额档位',
  whisper: '碎碎念',
  workStatus: '工作状态',
  workTransition: '办公衔接',
};

/** 把动画名包成叶子。 */
export const leaf = (anim: string): MenuLeaf => ({ label: anim, anim });

/** 由成品 animations 配置推导菜单树：一级「动作」→ 二级分类 → 三级动画名；空池与空分类自动省略。 */
export function buildMenuTree(animations: Animations): MenuNode[] {
  const groups: MenuBranch[] = [];
  const byLabel = new Map<string, MenuBranch>();
  const seen = new Set<string>();
  const addGroup = (label: string, names: string[]): void => {
    const children: MenuLeaf[] = [];
    for (const name of names) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      children.push(leaf(name));
    }
    if (!children.length) return;
    const existing = byLabel.get(label);
    if (existing) existing.children.push(...children);
    else {
      const group = { label, children };
      byLabel.set(label, group);
      groups.push(group);
    }
  };
  const pools: Array<[string, string[]]> = [
    ['待机', animations.idle],
    ['转向', animations.turn],
    ['拖拽', animations.drag],
    ['点击回应', animations.clicks],
    ['移动', animations.moves.actions.map((m) => m.name)],
  ];
  const cats = (animations.categories ?? []).filter((c) => c.actions.length > 0);
  const events = animations.events ?? {};
  const eventNames = Object.values(events).flat(2);
  const registered = new Set([
    ...pools.flatMap(([, names]) => names),
    ...cats.flatMap((c) => c.actions),
    ...eventNames,
  ]);
  const sequence = animations.workSequence;
  // 只整理既有可点播集合，不把未注册素材加入菜单或改变宿主点播校验。
  const office = sequence
    ? (sequence.introOnly ? [sequence.enter] : [sequence.enter, ...sequence.loops, sequence.exit]).filter((name) =>
        registered.has(name),
      )
    : [];
  const officeNames = new Set(office);
  const classified = new Set([...cats.flatMap((c) => c.actions), ...office]);
  for (const [label, pool] of pools) {
    addGroup(label, label === '待机' ? pool : pool.filter((name) => !classified.has(name)));
  }
  // 用途分类优先于点击／拖拽等触发方式；镜像限制仍由原 categories 决定。
  for (const c of cats)
    addGroup(
      c.id,
      c.actions.filter((name) => !officeNames.has(name)),
    );
  addGroup('办公动作', office);
  // 多个事件档位可能复用同一片段，展平后只保留尚未展示的动作。
  for (const key of Object.keys(events)) {
    const pool = events[key] ?? [];
    const names: string[] = [];
    for (const slot of pool) {
      if (typeof slot === 'string') names.push(slot);
      else names.push(...slot);
    }
    addGroup(EVENT_LABELS[key] ?? key, names);
  }
  if (!groups.length) return [];
  return [{ label: '动作', children: groups }];
}

/** 该动画是否属于 noMirror 分类（文字类）：朝右镜像时点播前强制朝左，避免文字镜像。 */
export function isNoMirrorAnimation(categories: Category[], anim: string): boolean {
  return (categories ?? []).some((c) => c.noMirror === true && c.actions.includes(anim));
}
