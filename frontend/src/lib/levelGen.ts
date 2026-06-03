// 派对模式 · 轻肉鸽关卡生成器
// 每层自动生成棋盘地形 + 订单 + 候选贴纸池 + 材质/外观权重，难度随层数缓慢递增。

type Terrain = 'normal'|'masked'|'crate'|'stain'|'fog'|'reward';

import { ALL_STICKER_IDS, HIDDEN_CODEX_STICKER_IDS } from './collection';

// 与 Index.tsx 中关卡 lv() 的字段对齐
export interface PartyLevel {
  key: string;       // "第 1 层" / "第 2 层"
  ch: number;        // 章节风格（用于 board-frame 主题色）
  name: string;
  sub: string;
  art: string;
  goal: string;
  star: number;
  pool: string[];
  orders: [string, string, number][]; // [kind,label,target]
  terrain: Record<string, string[]>;  // {fog:[...], reward:[...]}
  bases: Record<number, string[]>;    // {2:[...], 3:[...]}
  mats: Record<string, number>;
  fins: Record<string, number>;
  tools: Record<string, number>;
  layer: number;
  rng: number;
}

// 简单基于 layer 的伪随机数序列（不依赖外部库）。
// 每次进入派对模式我们重置 SESSION_SALT，让同一层在不同游玩 session 里产出不同关卡；
// 同一 session 内同层多次访问保持稳定（避免重渲染抖动）。
let SESSION_SALT = Math.floor(Math.random() * 1_000_003);
export function reseedPartySession(){
  SESSION_SALT = Math.floor(Math.random() * 1_000_003) + Date.now() % 100003;
}
function rngSeq(seed: number) {
  let s = (seed * 9301 + 49297 + SESSION_SALT * 131) % 2_147_483_647;
  if(s < 0) s = -s;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// 安静的房间名 / 美术意象（用于 sub / art 显示）
const ROOM_NAMES = [
  ['清晨窗台','晨光、窗台、植物'],
  ['小卖部','冰柜、零食袋、饮料罐'],
  ['公园长椅','树荫、长椅、风线'],
  ['美食街','灯串、菜单牌、夜市摊位'],
  ['音乐会','舞台、灯球、票根'],
  ['夜市摊位','招牌、亮片、霓虹边'],
  ['海边步道','海风、贝壳、晚霞'],
  ['夏日广场','喷泉、气球、小舞台'],
  ['检票口','检票栏、入口地贴'],
  ['旋转木马','木马、灯圈、镀金细节'],
  ['气球摊','气球束、条纹棚布'],
  ['冰淇淋车','餐车、价目牌、奶油色'],
  ['演出区','幕布、灯架、聚光灯'],
  ['玩偶车','货架、玩偶堆、展示车'],
  ['摩天轮下','夜景、灯带、摩天轮'],
  ['烟花广场','烟花、庆典、舞台远景'],
];

// 全部贴纸 id（与 Index.tsx 同步，简化为常量复制）
const PARTY_POOL_STICKERS = ALL_STICKER_IDS.filter(id => !HIDDEN_CODEX_STICKER_IDS.includes(id));

// 订单池（kind, labelTemplate, baseTarget）
const ORDER_TEMPLATES: { kind:string; label:(t:number)=>string; min:number; weight:number }[] = [
  { kind:'place',    label:(t)=>`贴入 ${t} 张贴纸`,    min:3,  weight:5 },
  { kind:'food',     label:(t)=>`收集 ${t} 个食物贴纸`, min:2,  weight:4 },
  { kind:'adjacent', label:(t)=>`触发相邻收益 ${t} 次`, min:2,  weight:4 },
  { kind:'high',     label:(t)=>`命中高分格 ${t} 次`,   min:1,  weight:3 },
  { kind:'material', label:(t)=>`材质触发 ${t} 次`,     min:1,  weight:3 },
  { kind:'finish',   label:(t)=>`外观触发 ${t} 次`,     min:1,  weight:2 },
];

function pickWeighted<T extends {weight:number}>(arr: T[], rng:()=>number): T {
  const tot = arr.reduce((s,x)=>s+x.weight,0);
  let c = rng() * tot;
  for(const it of arr){ if(c<it.weight) return it; c-=it.weight; }
  return arr[arr.length-1];
}

// 在棋盘上随机选 n 个不重复格子（避开边角，保证可贴）
function pickCells(rng:()=>number, count:number, exclude:Set<string>): string[] {
  const out: string[] = [];
  let safety = count * 20;
  while(out.length < count && safety-- > 0){
    const r = 1 + Math.floor(rng() * 6);  // 1..6
    const c = 1 + Math.floor(rng() * 4);  // 1..4
    const key = `${r},${c}`;
    if(exclude.has(key) || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

export function generatePartyLevel(layer: number): PartyLevel {
  const rng = rngSeq(layer * 131 + 17);
  const room = ROOM_NAMES[(layer - 1) % ROOM_NAMES.length];
  const ch = ((layer - 1) % 2) + 1;

  // 难度曲线：层数越高，订单越严，目标分数越大
  const star = 8 + Math.floor(layer * 4 + rng() * 6);

  // 候选贴纸池：5-7 张随机贴纸
  const poolSize = 5 + Math.floor(rng() * 3);
  const shuffled = [...PARTY_POOL_STICKERS].sort(()=>rng()-0.5);
  const pool = shuffled.slice(0, poolSize);

  // 订单：1-3 条，层数越高越多
  const orderCount = layer < 3 ? 1 : layer < 6 ? 2 : 3;
  const orders: [string,string,number][] = [];
  const used = new Set<string>();
  for(let i=0;i<orderCount;i++){
    let tpl = pickWeighted(ORDER_TEMPLATES, rng);
    let tries = 0;
    while(used.has(tpl.kind) && tries++ < 8){ tpl = pickWeighted(ORDER_TEMPLATES, rng); }
    used.add(tpl.kind);
    const target = tpl.min + Math.floor(layer * 0.4 + rng() * 2);
    orders.push([tpl.kind, tpl.label(target), target]);
  }

  // 地形：层数 ≥ 2 引入特殊格
  const exclude = new Set<string>();
  const terrain: Record<string,string[]> = {};
  if(layer >= 2){
    const fogCount = Math.min(2, Math.floor(layer / 3));
    if(fogCount>0){
      const fog = pickCells(rng, fogCount, exclude);
      fog.forEach(k=>exclude.add(k));
      terrain.fog = fog;
    }
  }
  // 奖励格：每层都有 1-2 个
  const rewardCount = 1 + Math.floor(rng() * 2);
  const reward = pickCells(rng, rewardCount, exclude);
  reward.forEach(k=>exclude.add(k));
  terrain.reward = reward;

  // 高分格 bases：奖励格统一 base=3；额外加 2-4 个 base=2 加分格
  const bases: Record<number,string[]> = { 3: [...reward] };
  const addBaseCount = 2 + Math.floor(rng() * 3);
  const adds = pickCells(rng, addBaseCount, exclude);
  bases[2] = adds;

  // 材质 / 外观权重：层数越高，特殊版本越多
  const specialW = Math.min(45, 10 + layer * 3);
  const mats: Record<string,number> = { 普通: 100 - specialW };
  const matsExtras: ['镭射'|'布料'|'磨砂'|'水晶贴'|'泡泡贴'|'烫金', number][] = [
    ['镭射', 0.2],['水晶贴',0.2],['烫金',0.2],['布料',0.15],['磨砂',0.15],['泡泡贴',0.1],
  ];
  matsExtras.forEach(([k,w])=>{ mats[k] = Math.max(1, Math.round(specialW * w)); });

  const finW = Math.min(40, 8 + layer * 3);
  const fins: Record<string,number> = { 普通: 100 - finW };
  const finsExtras: ['金色闪粉'|'彩色闪粉'|'动态贴纸'|'荧光贴纸', number][] = [
    ['金色闪粉',0.3],['彩色闪粉',0.25],['动态贴纸',0.25],['荧光贴纸',0.2],
  ];
  finsExtras.forEach(([k,w])=>{ fins[k] = Math.max(1, Math.round(finW * w)); });

  return {
    key: `第 ${layer} 层`,
    ch,
    name: room[0],
    sub: `第 ${layer} 层 · 轻肉鸽`,
    art: room[1],
    goal: orders.map(o=>o[1]).join('；'),
    star,
    pool,
    orders,
    terrain,
    bases,
    mats,
    fins,
    tools: {},
    layer,
    rng: layer,
  };
}
