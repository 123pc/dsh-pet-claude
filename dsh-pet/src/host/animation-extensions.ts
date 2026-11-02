/**
 * 可选动画扩展的读取校验；不改变旧 animations 的完整性规则。
 * 单个扩展损坏时只停用该扩展，保留角色自己的素材池与其它未知字段。
 * @module dsh-pet/src/host/animation-extensions
 */

/** 从既有播放池收集素材名；扩展本身不能注册新的点播素材。 */
function animationNames(a: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value) names.add(value);
    else if (Array.isArray(value)) value.forEach(add);
  };
  for (const key of ['idle', 'turn', 'drag', 'clicks']) add(a[key]);
  const moves = a.moves as { actions?: unknown } | undefined;
  if (Array.isArray(moves?.actions)) for (const move of moves.actions) if (record(move)) add(move.name);
  if (Array.isArray(a.categories)) for (const category of a.categories) if (record(category)) add(category.actions);
  if (record(a.events)) Object.values(a.events).forEach(add);
  return names;
}

/** JSON 配置中的普通对象。 */
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** 办公段只能引用既有动作，避免未注册素材绕过宿主点播与路径约束。 */
function workSequenceValid(value: unknown, names: Set<string>): boolean {
  if (!record(value)) return false;
  return (
    (value.introOnly === undefined || typeof value.introOnly === 'boolean') &&
    (value.enterText === undefined ||
      (typeof value.enterText === 'string' && value.enterText.trim().length > 0 && value.enterText.length <= 80)) &&
    typeof value.enter === 'string' &&
    names.has(value.enter) &&
    typeof value.exit === 'string' &&
    names.has(value.exit) &&
    Array.isArray(value.loops) &&
    value.loops.length > 0 &&
    value.loops.length <= 64 &&
    value.loops.every((name) => typeof name === 'string' && names.has(name))
  );
}

/** 时间窗、随机密度和重复数均有界；避免坏配置阻塞两端播放器。 */
function ambientValid(value: unknown, names: Set<string>, idle: unknown): boolean {
  if (!record(value)) return false;
  const number = (key: string, min: number, max: number, integer = false): boolean => {
    const n = value[key];
    return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
  };
  if (
    !number('windowSec', 30, 3600) ||
    !number('minEpisodes', 0, 6, true) ||
    !number('maxEpisodes', 1, 6, true) ||
    Number(value.minEpisodes) > Number(value.maxEpisodes) ||
    !number('edgeSec', 0, Number(value.windowSec) / 2 - 1) ||
    !number('minGapSec', 0, Number(value.windowSec)) ||
    !number('chainChance', 0, 1) ||
    !Array.isArray(idle) ||
    !idle.length ||
    !Array.isArray(value.chains) ||
    value.chains.length > 64
  )
    return false;
  const ids = new Set<string>();
  for (const chain of value.chains) {
    if (
      !record(chain) ||
      typeof chain.id !== 'string' ||
      !chain.id ||
      ids.has(chain.id) ||
      typeof chain.label !== 'string' ||
      !chain.label ||
      typeof chain.weight !== 'number' ||
      !Number.isFinite(chain.weight) ||
      chain.weight <= 0 ||
      chain.weight > 1000000 ||
      !Array.isArray(chain.steps) ||
      !chain.steps.length ||
      chain.steps.length > 12
    )
      return false;
    ids.add(chain.id);
    for (const step of chain.steps) {
      if (!record(step) || typeof step.name !== 'string' || !names.has(step.name)) return false;
      if (
        step.repeats !== undefined &&
        (typeof step.repeats !== 'number' || !Number.isInteger(step.repeats) || step.repeats < 1 || step.repeats > 10)
      )
        return false;
    }
  }
  return true;
}

/** 返回可消费的浅拷贝；旧配置/有效扩展保持原对象，绝不修改磁盘读取对象。 */
export function sanitizeAnimationExtensions(
  animations: Record<string, unknown>,
  onInvalid?: (key: 'workSequence' | 'ambient') => void,
): Record<string, unknown> {
  let out = animations;
  const names = animationNames(animations);
  for (const key of ['workSequence', 'ambient'] as const) {
    if (animations[key] === undefined) continue;
    const valid =
      key === 'workSequence'
        ? workSequenceValid(animations[key], names)
        : ambientValid(animations[key], names, animations.idle);
    if (valid) continue;
    if (out === animations) out = { ...animations };
    delete out[key];
    onInvalid?.(key);
  }
  return out;
}
