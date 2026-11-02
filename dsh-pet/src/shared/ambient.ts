/**
 * 按独立时钟安排自主小活动，浏览器和桌面使用相同决策。
 * 活动之间回到循环待机；被工作、互动或锁打断后丢弃剩余步骤。
 * @module dsh-pet/src/shared/ambient
 */
import type { Animations, ActivityChain } from './types.ts';
import { isEventAnim } from './pickers.ts';

/** 一次播放指令；rest 为真时持续循环，等待时间表触发。 */
export interface AmbientCue {
  name: string;
  rest: boolean;
  label: string;
}

/** 调度所需的即时上下文；不读取 DOM 或全局工作状态。 */
export interface AmbientContext {
  current: string;
  blocked: boolean;
  fixed: boolean;
  facing: string;
}

/** 可观察的调度快照，用于预览与测试，不包含用户数据。 */
export interface AmbientSnapshot {
  windowStart: number;
  windowEnd: number;
  due: number[];
  active: string | null;
}

/** 每只宠物一份；调用方负责周期 tick 和真实 ended 通知。时间单位为单调时钟毫秒。 */
export class AmbientDirector {
  declare private start: number;
  declare private due: number[];
  declare private queue: string[];
  declare private expected: string | null;
  declare private label: string | null;
  declare private lastChain: string | null;
  declare private quietUntil: number;
  declare private animations: Animations;
  declare private random: () => number;

  constructor(animations: Animations, now: number, random: () => number = Math.random) {
    this.animations = animations;
    this.random = random;
    // 显式赋值避免 ES2020 构建为字段初始化额外引入未声明的运行依赖。
    this.due = [];
    this.queue = [];
    this.expected = null;
    this.label = null;
    this.lastChain = null;
    this.quietUntil = 0;
    this.start = now;
    this.plan();
  }

  /** 当前活动是否还有步骤等待播放。 */
  get running(): boolean {
    return this.expected !== null;
  }

  /** 工作与用户操作抢占时调用；不重置时间窗，也不在恢复后补播旧活动。 */
  cancel(now: number): void {
    this.queue = [];
    this.expected = null;
    this.label = null;
    this.quietUntil = Math.max(this.quietUntil, now + 10000);
  }

  /** 时间表的只读副本；查询不会推进随机数或状态。 */
  snapshot(): AmbientSnapshot {
    return {
      windowStart: this.start,
      windowEnd: this.start + this.config.windowSec * 1000,
      due: [...this.due],
      active: this.label,
    };
  }

  private get config() {
    return this.animations.ambient!;
  }

  private plan(): void {
    const c = this.config;
    const count = c.minEpisodes + Math.floor(this.random() * (c.maxEpisodes - c.minEpisodes + 1));
    this.due = [];
    // 拒绝过近的抽样；抽样次数有界，极端随机源下宁可少安排一次也不扎堆。
    for (let n = 0; n < 64 && this.due.length < count; n++) {
      const time = this.start + (c.edgeSec + this.random() * (c.windowSec - 2 * c.edgeSec)) * 1000;
      if (this.due.every((t) => Math.abs(t - time) >= c.minGapSec * 1000)) this.due.push(time);
    }
    this.due.sort((a, b) => a - b);
  }

  private choose(context: AmbientContext): ActivityChain | null {
    const a = this.animations;
    const moves = new Set(a.moves.actions.map((m) => m.name));
    const noMirror = new Set(a.categories.filter((c) => c.noMirror).flatMap((c) => c.actions));
    const allowed = (name: string) =>
      !(context.fixed && moves.has(name)) && !(context.facing === 'right' && noMirror.has(name));
    const allChains = this.config.chains.filter((c) => c.steps.length && c.steps.every((s) => allowed(s.name)));
    const fresh = allChains.filter((c) => c.id !== this.lastChain);
    const chains = fresh.length ? fresh : allChains;
    if (chains.length && this.random() < this.config.chainChance) {
      let choice = this.random() * chains.reduce((n, c) => n + c.weight, 0);
      const chain = chains.find((c) => (choice -= c.weight) <= 0) || chains[chains.length - 1];
      this.lastChain = chain.id;
      return chain;
    }
    const singles = [
      ...new Set([...a.categories.flatMap((c) => c.actions), ...a.moves.actions.map((m) => m.name)]),
    ].filter((n) => allowed(n) && !a.idle.includes(n) && !isEventAnim(a.events, n) && n !== a.workSequence?.enter);
    if (!singles.length) return null;
    const name = singles[Math.min(singles.length - 1, Math.floor(this.random() * singles.length))];
    return { id: 'single:' + name, label: name, weight: 1, steps: [{ name }] };
  }

  private begin(chain: ActivityChain): AmbientCue {
    this.queue = chain.steps.flatMap((s) => Array.from({ length: s.repeats ?? 1 }, () => s.name));
    this.label = chain.label;
    this.lastChain = chain.id;
    this.expected = this.queue.shift()!;
    return { name: this.expected, rest: false, label: chain.label };
  }

  /** 明确点选某条活动链的预览入口；不绕过工作占用、固定位置和镜像约束。 */
  preview(id: string, now: number, context: AmbientContext): AmbientCue | null {
    const chain = this.config.chains.find((c) => c.id === id);
    const moves = new Set(this.animations.moves.actions.map((m) => m.name));
    const noMirror = new Set(this.animations.categories.filter((c) => c.noMirror).flatMap((c) => c.actions));
    if (
      !chain ||
      context.blocked ||
      chain.steps.some(
        (s) => (context.fixed && moves.has(s.name)) || (context.facing === 'right' && noMirror.has(s.name)),
      )
    )
      return null;
    this.cancel(now);
    return this.begin(chain);
  }

  /** 可随时触发，不等待 idle 视频结束；繁忙时消费过期时间点，绝不随后连播补偿。 */
  tick(now: number, context: AmbientContext): AmbientCue | null {
    const window = this.config.windowSec * 1000;
    if (now >= this.start + window) {
      this.start += Math.floor((now - this.start) / window) * window;
      this.plan();
    }
    if (this.running && (context.blocked || context.current !== this.expected)) this.cancel(now);
    let due = false;
    while (this.due.length && this.due[0] <= now) {
      const at = this.due.shift()!;
      if (now - at <= 2000) due = true;
    }
    if (
      !due ||
      context.blocked ||
      this.running ||
      now < this.quietUntil ||
      !this.animations.idle.includes(context.current)
    )
      return null;
    const chain = this.choose(context);
    if (!chain) return null;
    return this.begin(chain);
  }

  /** 只推进本活动实际正在播放的片段；与任何外部 ended 无关。 */
  ended(current: string, now: number, blocked: boolean): AmbientCue | null {
    if (!this.running) return null;
    if (blocked || current !== this.expected) {
      this.cancel(now);
      return null;
    }
    const next = this.queue.shift();
    if (next) {
      this.expected = next;
      return { name: next, rest: false, label: this.label! };
    }
    this.cancel(now);
    this.quietUntil = now + (18 + this.random() * 17) * 1000;
    return { name: this.animations.idle[0], rest: true, label: '安静待机' };
  }
}
