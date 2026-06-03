import { useEffect, useRef, useState } from 'react';

// 派对模式 · 弹幕通知
// 全屏特效层：fixed inset-0 / pointer-events:none / z 高于棋盘但低于结算弹窗(z-50)
// 横向从右滑入左侧消失，多条轨道排队避免追尾。
// 视觉：奶油白胶囊 + 暖金描边 + 轻微弹跳/光晕特效，与项目手账风一致。

export type BulletKind = 'new' | 'dup';

export type Bullet = {
  id: number;
  icon: string;
  name: string;       // 贴纸名
  variant: string;    // 例如：镭射 / 烫金
  kind: BulletKind;   // 新解锁 vs 已拥有
  track: number;
};

const TRACK_COUNT = 4;
const DURATION_MS = 8800;     // 一条弹幕生命周期（放慢约 70%，让玩家看清贴纸+文案）
const TRACK_GAP_MS = 1500;    // 同轨道最小间隔，避免追尾（随时长同步加大）

let _bid = 1;
const trackBusyUntil: number[] = Array(TRACK_COUNT).fill(0);

// 选择一个最早空闲的轨道，避免追尾
function pickTrack(now: number): number {
  let best = 0;
  let bestTime = trackBusyUntil[0];
  for (let i = 1; i < TRACK_COUNT; i++) {
    if (trackBusyUntil[i] < bestTime) {
      best = i;
      bestTime = trackBusyUntil[i];
    }
  }
  trackBusyUntil[best] = Math.max(now, bestTime) + TRACK_GAP_MS;
  return best;
}

// 全局事件总线 — 任何位置 emitBullet 都可以推一条弹幕
type BulletInput = { icon: string; name: string; variant: string; kind: BulletKind };
type Listener = (b: Bullet) => void;
const listeners: Listener[] = [];

export function emitBullet(input: BulletInput) {
  const now = Date.now();
  const track = pickTrack(now);
  const b: Bullet = {
    id: _bid++,
    icon: input.icon,
    name: input.name,
    variant: input.variant,
    kind: input.kind,
    track,
  };
  listeners.forEach((fn) => fn(b));
}

export default function PartyBulletStream({ active }: { active: boolean }) {
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const timersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const fn: Listener = (b) => {
      setBullets((cur) => [...cur, b]);
      const t = window.setTimeout(() => {
        setBullets((cur) => cur.filter((x) => x.id !== b.id));
        delete timersRef.current[b.id];
      }, DURATION_MS + 200);
      timersRef.current[b.id] = t;
    };
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  // 模式切换时清空（active 由父组件传：仅 party 模式下挂载/激活）
  useEffect(() => {
    if (!active) {
      setBullets([]);
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
      timersRef.current = {};
    }
  }, [active]);

  if (!active) return null;

  return (
    <div className="party-bullet-layer" aria-hidden>
      {bullets.map((b) => (
        <div
          key={b.id}
          className={`party-bullet party-bullet--${b.kind}`}
          style={{
            top: `calc(12% + ${b.track * 96}px)`,
            animationDuration: `${DURATION_MS}ms`,
          }}
        >
          <span className="party-bullet-icon">
            <img src={b.icon} alt="" draggable={false} />
            {b.kind === 'new' && <span className="party-bullet-spark" aria-hidden>✨</span>}
          </span>
          <span className="party-bullet-text">
            <span className={`party-bullet-tag party-bullet-tag--${b.kind}`}>
              {b.kind === 'new' ? '新解锁' : '已拥有'}
            </span>
            <span className="party-bullet-name">{b.name}</span>
            <span className="party-bullet-variant">· {b.variant}</span>
          </span>
        </div>
      ))}
    </div>
  );
}