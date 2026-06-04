// 贴纸图鉴 / 解锁系统
// 每个 unlock entry 对应一个 (stickerId, material, finish) 组合，是否已解锁。

import {
  CODEX_MATERIAL_KEYS,
  CODEX_FINISH_KEYS,
  type CodexFinishKey,
  type CodexMaterialKey,
} from '@/game/data/stickerVariants';

export type MaterialKey = CodexMaterialKey;
export type FinishKey = CodexFinishKey;
export type StickerUnlockTarget = { id: string; material: MaterialKey; finish: FinishKey };

export const CODEX_MATERIALS: MaterialKey[] = [...CODEX_MATERIAL_KEYS];
export const CODEX_FINISHES: FinishKey[] = [...CODEX_FINISH_KEYS];

// 全部 18 张贴纸 ID（与 Index.tsx 中的 S 列表 id 保持一致）
export const ALL_STICKER_IDS = [
  'strawberry','star','plant','cherry','cat','cake','balloon','cream','flower',
  'ticket','music','gift','shell','carousel','gummy','seagull','daisy','envelope','cat_mom','starry_star',
];

export const HIDDEN_CODEX_STICKER_IDS = ['cat_mom','starry_star'];

export const COLLECTION_KEY = 'sticker_collection_v1';

// 单条解锁记录 key 编码：`${id}__${material}__${finish}`
export const encodeUnlockKey = (id: string, m: MaterialKey, f: FinishKey) => `${id}__${m}__${f}`;
export const decodeUnlockKey = (k: string): { id:string; material:MaterialKey; finish:FinishKey } | null => {
  const parts = k.split('__');
  if (parts.length !== 3) return null;
  return { id: parts[0], material: parts[1] as MaterialKey, finish: parts[2] as FinishKey };
};

export const isHiddenCodexSticker = (id: string): boolean => HIDDEN_CODEX_STICKER_IDS.includes(id);

export function getStickerUnlockTargets(id: string): StickerUnlockTarget[] {
  const targets: StickerUnlockTarget[] = [];
  CODEX_MATERIALS.forEach(m => {
    CODEX_FINISHES.forEach(f => {
      targets.push({ id, material: m, finish: f });
    });
  });
  return targets;
}

export function unlockStickerFamily(unlocks: string[], id: string): string[] {
  const merged = new Set<string>(unlocks);
  getStickerUnlockTargets(id).forEach(target => {
    merged.add(encodeUnlockKey(target.id, target.material, target.finish));
  });
  return Array.from(merged);
}

// 初始化：18 张贴纸的「普通 / 普通」基础版本默认解锁，保证旧日记功能可用。
export function getInitialUnlocks(): string[] {
  return ALL_STICKER_IDS.map(id => encodeUnlockKey(id, '普通', '普通'));
}

import { getItem as acctGetItem, setItem as acctSetItem } from './account';

export function loadUnlocks(): string[] {
  try {
    const raw = acctGetItem(COLLECTION_KEY);
    if (!raw) return getInitialUnlocks();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return getInitialUnlocks();
    // 合并初始 + 已存：任何老用户都至少拥有 18 张基础版
    const merged = new Set<string>([...getInitialUnlocks(), ...arr.filter((x: any) => typeof x === 'string')]);
    return Array.from(merged);
  } catch {
    return getInitialUnlocks();
  }
}

export function saveUnlocks(unlocks: string[]): void {
  try {
    acctSetItem(COLLECTION_KEY, JSON.stringify(unlocks));
  } catch {
    // ignore quota errors
  }
}

export function isUnlocked(unlocks: string[], id: string, m: MaterialKey, f: FinishKey): boolean {
  return unlocks.includes(encodeUnlockKey(id, m, f));
}

// 统计某张贴纸已解锁版本数 / 总版本数
export function countStickerUnlocks(unlocks: string[], id: string): { unlocked:number; total:number } {
  let unlocked = 0;
  const total = CODEX_MATERIALS.length * CODEX_FINISHES.length;
  CODEX_MATERIALS.forEach(m => CODEX_FINISHES.forEach(f => {
    if (isUnlocked(unlocks, id, m, f)) unlocked++;
  }));
  return { unlocked, total };
}

export function isStickerCodexRevealed(unlocks: string[], id: string): boolean {
  if (!isHiddenCodexSticker(id)) return true;
  return CODEX_MATERIALS.some(m => CODEX_FINISHES.some(f => isUnlocked(unlocks, id, m, f)));
}

// 在派对模式通关一层时，按概率掉落一个尚未解锁的 (id, material, finish) 组合
// 返回 null 表示本层不掉落或全部已解锁
export function rollDrop(
  unlocks: string[],
  layer: number,
  poolIds: string[] = ALL_STICKER_IDS,
  rng: () => number = Math.random,
): { id: string; material: MaterialKey; finish: FinishKey; key: string } | null {
  // 概率：第 1 层 35%，每层 +6%，上限 80%
  const p = Math.min(0.8, 0.35 + (layer - 1) * 0.06);
  if (rng() > p) return null;

  // 找出所有未解锁组合
  const locked: { id: string; material: MaterialKey; finish: FinishKey; key: string; weight: number }[] = [];
  poolIds.forEach(id => {
    if (isHiddenCodexSticker(id) && !isStickerCodexRevealed(unlocks, id)) return;
    CODEX_MATERIALS.forEach(m => {
      CODEX_FINISHES.forEach(f => {
        const key = encodeUnlockKey(id, m, f);
        if (!unlocks.includes(key)) locked.push({ id, material: m, finish: f, key, weight: isHiddenCodexSticker(id) ? 0.35 : 1 });
      });
    });
  });
  if (!locked.length) return null;

  const totalWeight = locked.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * totalWeight;
  for (const item of locked) {
    cursor -= item.weight;
    if (cursor <= 0) return { id: item.id, material: item.material, finish: item.finish, key: item.key };
  }
  const fallback = locked[locked.length - 1];
  return { id: fallback.id, material: fallback.material, finish: fallback.finish, key: fallback.key };
}
