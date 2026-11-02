/**
 * 办公道具衔接的纯状态机，由浏览器与桌面共同消费。
 * 入场和收起必须播完；任务细节更新不会重播拿电脑动作。
 * @module dsh-pet/src/shared/work-sequence
 */
import type { WorkSequence } from './types.ts';
import { pick } from './pickers.ts';

/** 当前办公道具处于的阶段。 */
export type WorkPhase = 'closed' | 'opening' | 'open' | 'closing';

/** 一次状态机决策；name=null 表示保持当前段或把控制交还普通待机链。 */
export interface WorkSequenceStep {
  phase: WorkPhase;
  name: string | null;
  handled: boolean;
}

/** 依据最新工作状态推进一次；ended 只在衔接片段真实结束时传 true。 */
export function advanceWorkSequence(
  sequence: WorkSequence | undefined,
  phase: WorkPhase,
  state: string | null | undefined,
  current: string,
  ended = false,
): WorkSequenceStep {
  if (!sequence) return { phase, name: null, handled: false };
  const working = !!state && state !== 'success' && state !== 'error';
  if (sequence.introOnly) {
    // 接单礼仪不占用办公道具；结束、失败与手动互动都可立即打断，当前任务内不补播。
    if (!working) return { phase: 'closed', name: null, handled: false };
    if (phase === 'closed') return { phase: 'opening', name: sequence.enter, handled: true };
    if (phase === 'opening' && current === sequence.enter && !ended) return { phase, name: null, handled: true };
    return { phase: 'open', name: null, handled: false };
  }
  // 点击、拖拽或点播可中断衔接段；不能永远等一个已被换走的视频结束。
  if (phase === 'opening' && current !== sequence.enter) {
    return working
      ? { phase: 'opening', name: sequence.enter, handled: true }
      : { phase: 'closing', name: sequence.exit, handled: true };
  }
  if (phase === 'closing' && current !== sequence.exit) {
    return working
      ? { phase: 'opening', name: sequence.enter, handled: true }
      : { phase: 'closed', name: null, handled: false };
  }
  if (phase === 'opening' && !ended) return { phase, name: null, handled: true };
  if (phase === 'closing') {
    if (!ended) return { phase, name: null, handled: true };
    phase = 'closed';
  }
  if (working) {
    if (phase === 'closed') return { phase: 'opening', name: sequence.enter, handled: true };
    if (phase === 'open' && !ended && sequence.loops.includes(current)) {
      return { phase, name: null, handled: true };
    }
    return { phase: 'open', name: pick(sequence.loops, current), handled: true };
  }
  if (phase === 'open' || phase === 'opening') {
    return { phase: 'closing', name: sequence.exit, handled: true };
  }
  return { phase: 'closed', name: null, handled: false };
}

/** 外部互动片段不属于这条衔接链，其 ended 由原来的恢复逻辑处理。 */
export function isWorkSequenceAnim(sequence: WorkSequence | undefined, name: string): boolean {
  return (
    !!sequence &&
    (name === sequence.enter || (!sequence.introOnly && (name === sequence.exit || sequence.loops.includes(name))))
  );
}
