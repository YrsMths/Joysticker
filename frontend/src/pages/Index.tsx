import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Box, CloudRain, Coins, Eraser, Gift, Layers, Lock, PackageOpen, PartyPopper, PenLine, RefreshCw, RotateCw, ShoppingBag, Sparkles, Star, Sun, Trash2, Trophy, Trees, Type, UtensilsCrossed, X, Zap } from 'lucide-react';
import {
  CODEX_MATERIALS, CODEX_FINISHES, ALL_STICKER_IDS,
  encodeUnlockKey, isUnlocked, countStickerUnlocks, rollDrop,
  loadUnlocks, saveUnlocks, isStickerCodexRevealed, unlockStickerFamily,
  type MaterialKey as CMaterial, type FinishKey as CFinish,
} from '@/lib/collection';
import type { StickerFinishKey, StickerMaterialKey } from '@/game/data/stickerVariants';
import { FINISHES, MATERIALS } from '@/game/data/stickerVariantMeta';
import { getStickerVariantDecoClasses } from '@/game/data/stickerVariantVisuals';
import { generatePartyLevel, reseedPartySession, type PartyLevel } from '@/game/systems/levelGen';
import { STORY_COVERS } from '@/game/data/storyCovers';
import MyDiaryBook, { loadDiaryBook, appendDiaryEntry, type DiaryEntry, type DiaryItemSnapshot } from '@/game/components/MyDiaryBook';
import PartyBulletStream, { emitBullet } from '@/game/components/PartyBulletStream';
import StickerLightbox from '@/game/components/StickerLightbox';
import AccountBadge from '@/game/components/AccountBadge';
import { initAccounts, getItem as acctGetItem, setItem as acctSetItem, type Account } from '@/game/state/account';

type Mode='home'|'storyMenu'|'story'|'party'|'diary'|'shop';
type Terrain='normal'|'masked'|'crate'|'stain'|'fog'|'reward';
const ROWS=8,COLS=6,KEY='happy-sticker-book-v7';

// ===== 占格拓扑池（15 种） =====
// 每个 shape 是 [r,c] 坐标列表，左上对齐，锚点为 (0,0) 所在偏移
type Shape = number[][];
type VariantPatternRequirement = {
  stickerIds?: string[];
  types?: string[];
  shapeKeys?: string[];
  count: number;
};
type VariantRuleBase = {
  id:string;
  name:string;
  triggerStickerIds?:string[];
  triggerShapeKeys?:string[];
  triggerTypes?:string[];
  unlockStickerIds?:string[];
};
type CombinationVariantUpgradeRule = VariantRuleBase & {
  mode:'combination';
  resultId:string;
  pattern:{
    targetShapeKey:string;
    requirements: VariantPatternRequirement[];
  };
};
type AdjacentVariantMapping = {
  fromId:string;
  toId:string;
};
type AdjacentVariantUpgradeRule = VariantRuleBase & {
  mode:'adjacent';
  adjacency:{
    pairings: AdjacentVariantMapping[];
  };
};
type VariantUpgradeRule = CombinationVariantUpgradeRule | AdjacentVariantUpgradeRule;
const withBase = (path:string)=>`${import.meta.env.BASE_URL}${path.replace(/^\//,'')}`;
const STAR_DYNAMIC_FRAMES = Array.from({length:33},(_,i)=>withBase(`assets/images/stickers/fantasy/sticker-star-dynamic/${i+1}.png`));
const WEATHER_FRAMES: Record<PartyWeatherKey,string[]> = {
  晴朗: Array.from({length:25},(_,i)=>withBase(`assets/images/weather/sun/sun_${i}.png`)),
  雨: Array.from({length:25},(_,i)=>withBase(`assets/images/weather/rain/rain_${i}.png`)),
  雷: Array.from({length:25},(_,i)=>withBase(`assets/images/weather/thunder/thunder_${i}.png`)),
};
const SCENE_FRAMES: Record<PartySceneKey,string[]> = {
  动物园: Array.from({length:30},(_,i)=>withBase(`assets/images/scene/zoo/${i}.png`)),
  游乐场: Array.from({length:25},(_,i)=>withBase(`assets/images/scene/playground/${i}.png`)),
  美食街: Array.from({length:30},(_,i)=>withBase(`assets/images/scene/foodstreet/${i}.png`)),
};
const PARTY_WEATHER_LABELS: Record<PartyWeatherKey,string> = {
  晴朗: '折射',
  雨: '湿润 / 亲水',
  雷: '连携',
};
const PARTY_SCENE_LABELS: Record<PartySceneKey,string> = {
  动物园: '动物伙伴共游',
  游乐场: '游乐热闹共鸣',
  美食街: '烟火小吃派对',
};
const PARTY_WEATHER_DESCRIPTIONS: Record<PartyWeatherKey,(level:PartyModifierLevel)=>string> = {
  晴朗: (level)=>`晴朗·折射：水晶贴贴入时，重触发${level===1?'随机 1 个':level===2?'随机 3 个':'全部'}其他水晶贴得分`,
  雨: (level)=>`雨·湿润 / 亲水：纸箱失效；泡泡贴贴入时得分膨胀 ×${level===1?1.5:level===2?2:3}`,
  雷: (level)=>`雷·连携：镭射贴入时，外圈 ${level} 层格子各有 30% 概率触发得分`,
};
const PARTY_SCENE_DESCRIPTIONS: Record<PartySceneKey,(level:PartyModifierLevel)=>string> = {
  动物园: (level)=>`动物园 Lv.${level}：动物类型贴纸基础加成 +${level===1?1:level===2?3:5}`,
  游乐场: (level)=>`游乐场 Lv.${level}：节日类型贴纸基础加成 +${level===1?1:level===2?3:5}`,
  美食街: (level)=>`美食街 Lv.${level}：食物类型贴纸基础加成 +${level===1?1:level===2?3:5}`,
};
const AUDIO_ASSETS = {
  ui: {
    click: withBase('assets/sounds/ui_button_click_soft.wav'),
    confirm: withBase('assets/sounds/ui_button_confirm_warm.wav'),
    back: withBase('assets/sounds/ui_button_back_soft.wav'),
  },
  bgm: {
    home: withBase('assets/sounds/bgm_home_scrapbook_daydream_loop.wav'),
    story: withBase('assets/sounds/bgm_story_cozy_diary_loop.wav'),
    party: withBase('assets/sounds/bgm_party_playful_combo_loop.wav'),
    diary: withBase('assets/sounds/bgm_diary_creative_gentle_loop.wav'),
    shop: withBase('assets/sounds/bgm_shop_soft_boutique_loop.wav'),
  },
  material: {
    普通: withBase('assets/sounds/material_place_normal_soft.wav'),
    镭射: withBase('assets/sounds/material_place_holo_shine.wav'),
    布料: withBase('assets/sounds/material_place_fabric_soft.wav'),
    磨砂: withBase('assets/sounds/material_place_frosted_mute.wav'),
    水晶贴: withBase('assets/sounds/material_place_crystal_glint.wav'),
    泡泡贴: withBase('assets/sounds/material_place_bubble_soft_pop.wav'),
    烫金: withBase('assets/sounds/material_place_gold_foil_glow.wav'),
  },
  score: {
    base: withBase('assets/sounds/score_base_tick.wav'),
  },
} as const;
type CoinBurst = { id:string; source:'score'|'party-choice'; amount:number; label:string };
type PartyChoiceOption = { id:string; title:string; detail:string; coinReward:number; weatherKey?:PartyWeatherKey; sceneKey?:PartySceneKey };
type PartyChoiceVisual = { badge:string; itemName:string; icon:JSX.Element; toneClass:string };
type BoardScorePopup = {
  id:string;
  row:number;
  col:number;
  value:number;
  kind:'base'|'pattern'|'special';
  label?:string;
  stackIndex:number;
  dx:number;
  dy:number;
  delay:number;
};
type PartyWeatherKey = '晴朗'|'雨'|'雷';
type PartySceneKey = '动物园'|'游乐场'|'美食街';
type PartyModifierLevel = 1|2|3;
type PartyWeatherState = {
  key: PartyWeatherKey;
  level: PartyModifierLevel;
};
type PartySceneState = {
  key: PartySceneKey;
  level: PartyModifierLevel;
};
const SHAPES: Record<string, Shape> = {
  '1x1':       [[0,0]],
  '2x1H':      [[0,0],[0,1]],
  '1x2V':      [[0,0],[1,0]],
  '3x1H':      [[0,0],[0,1],[0,2]],
  '1x3V':      [[0,0],[1,0],[2,0]],
  'L22':       [[0,0],[1,0],[1,1]],          // 2x2 的 L
  'rL22':      [[0,1],[1,0],[1,1]],          // 2x2 的反 L
  'T32':       [[0,0],[0,1],[0,2],[1,1]],    // 3x2 的 T
  'rT32':      [[1,0],[1,1],[1,2],[0,1]],    // 3x2 的反 T
  '2x2':       [[0,0],[0,1],[1,0],[1,1]],    // 2x2 满占
  'Z3':        [[0,0],[0,1],[1,1]],          // 3 格折线
  'I4':        [[0,0],[0,1],[0,2],[0,3]],    // 4 格长票根
  'S4':        [[0,0],[1,0],[1,1],[2,1]],    // 4 格台阶
  'C4':        [[0,1],[1,0],[1,1],[2,1]],    // 4 格弯月
  'F5':        [[0,1],[1,0],[1,1],[1,2],[2,1]], // 5 格花瓣
};
const SHAPE_LABEL: Record<string,string> = {
  '1x1':'1×1','2x1H':'2×1 横','1x2V':'1×2 纵','3x1H':'3×1 横','1x3V':'1×3 纵',
  'L22':'L 型','rL22':'反 L 型','T32':'T 型','rT32':'反 T 型','2x2':'2×2 满占',
  'Z3':'折线型','I4':'长票根','S4':'台阶型','C4':'弯月型','F5':'花瓣型',
};

// ===== 贴纸样例（覆盖全部 15 种拓扑） =====
type StickerDef = { id:string; name:string; type:string; shapeKey:string; asset:string; note:string };
const S: StickerDef[] = [
  { id:'strawberry', name:'草莓',         type:'食物', shapeKey:'1x1',  asset:withBase('assets/images/stickers/foods/sticker-strawberry-v2.png'), note:'食物订单核心' },
  { id:'star',       name:'星星',         type:'梦幻', shapeKey:'1x1',  asset:withBase('assets/images/stickers/fantasy/sticker-star-v2.png'),       note:'荧光与镭射联动' },
  { id:'plant',      name:'盆栽',         type:'植物', shapeKey:'1x1',  asset:withBase('assets/images/stickers/plants/sticker-plant-v2.png'),      note:'稳定补位' },
  { id:'cherry',     name:'樱桃双子',     type:'食物', shapeKey:'2x1H', asset:withBase('assets/images/stickers/foods/sticker-cherry-v2.png'),     note:'2×1 横向' },
  { id:'cat',        name:'小猫',         type:'动物', shapeKey:'1x2V', asset:withBase('assets/images/stickers/animals/sticker-cat-v2.png'),        note:'1×2 纵向' },
  { id:'cake',       name:'蛋糕卷',       type:'食物', shapeKey:'3x1H', asset:withBase('assets/images/stickers/foods/sticker-cake-v2.png'),       note:'3×1 长条' },
  { id:'balloon',    name:'波点气球',     type:'装饰', shapeKey:'1x3V', asset:withBase('assets/images/stickers/decorations/sticker-balloon-v2.png'),    note:'1×3 立式' },
  { id:'cream',      name:'奶油挤花袋',   type:'食物', shapeKey:'L22',  asset:withBase('assets/images/stickers/foods/sticker-cream-v3-l22.png'),     note:'L 型角落' },
  { id:'flower',     name:'小花',         type:'植物', shapeKey:'rL22', asset:withBase('assets/images/stickers/plants/sticker-flower-v3-rl22.png'),   note:'反 L 型' },
  { id:'ticket',     name:'彩虹票根',     type:'节日', shapeKey:'T32',  asset:withBase('assets/images/stickers/festival/sticker-ticket-v3-t32.png'),   note:'T 型节日' },
  { id:'music',      name:'音符串',       type:'梦幻', shapeKey:'rT32', asset:withBase('assets/images/stickers/fantasy/sticker-music-v3-rt32.png'),    note:'反 T 音乐' },
  { id:'gift',       name:'礼物盒',       type:'节日', shapeKey:'2x2',  asset:withBase('assets/images/stickers/festival/sticker-gift-v2.png'),         note:'2×2 满占' },
  { id:'shell',      name:'贝壳',         type:'梦幻', shapeKey:'Z3',   asset:withBase('assets/images/stickers/fantasy/sticker-shell-v3-z3.png'),     note:'3 格折线' },
  { id:'carousel',   name:'旋转木马票',   type:'装饰', shapeKey:'I4',   asset:withBase('assets/images/stickers/decorations/sticker-carousel-ticket-v6-stitched.png'),     note:'4 格长票根' },
  { id:'gummy',      name:'小熊软糖',     type:'食物', shapeKey:'S4',   asset:withBase('assets/images/stickers/foods/sticker-gummy-v3-s4.png'),     note:'4 格台阶' },
  { id:'seagull',    name:'海鸥',         type:'动物', shapeKey:'C4',   asset:withBase('assets/images/stickers/animals/sticker-seagull-v3-c4.png'),   note:'4 格弯月' },
  { id:'daisy',      name:'小雏菊环',     type:'植物', shapeKey:'F5',   asset:withBase('assets/images/stickers/plants/sticker-daisy-v3-f5.png'),     note:'5 格花瓣' },
  { id:'envelope',   name:'花边信封',     type:'装饰', shapeKey:'2x1H', asset:withBase('assets/images/stickers/decorations/sticker-envelope-v2.png'),   note:'生活补位' },
  { id:'cat_mom',    name:'猫妈妈',       type:'动物', shapeKey:'2x2',  asset:withBase('assets/images/stickers/animals/sticker-cat-mom.png'),       note:'两张小猫拼成 2×2 时升级揭示的变体贴纸' },
  { id:'starry_star',name:'星星眼星星',   type:'梦幻', shapeKey:'1x1',  asset:withBase('assets/images/stickers/fantasy/sticker-star-dynamic/1.png'), note:'星星相邻时觉醒的动态变体贴纸' },
];

const VARIANT_UPGRADE_RULES: VariantUpgradeRule[] = [
  {
    mode:'combination',
    id:'cat-family-2x2',
    resultId:'cat_mom',
    name:'猫妈妈',
    triggerStickerIds:['cat'],
    triggerShapeKeys:['1x2V','2x1H'],
    pattern:{
      targetShapeKey:'2x2',
      requirements:[
        { stickerIds:['cat'], count:2 },
      ],
    },
    unlockStickerIds:['cat_mom'],
  },
  {
    mode:'adjacent',
    id:'star-awaken-adjacent',
    name:'星星眼星星',
    triggerStickerIds:['star'],
    triggerShapeKeys:['1x1'],
    adjacency:{
      pairings:[
        { fromId:'star', toId:'starry_star' },
        { fromId:'starry_star', toId:'starry_star' },
      ],
    },
    unlockStickerIds:['starry_star'],
  },
];

type MaterialKey = StickerMaterialKey;
type FinishKey = StickerFinishKey;

// ===== 工具 =====
const T:any = {
  sponge:    { id:'sponge',    name:'海绵胶', icon:'🧽', note:'给已有贴纸加胶，下一张可叠贴' },
  eraser:    { id:'eraser',    name:'橡皮擦', icon:'🧼', note:'清理污渍格' },
  scissors:  { id:'scissors',  name:'剪刀',   icon:'✂️', note:'剪开纸箱格' },
};

// ===== 关卡 =====
const lv=(key:string,ch:number,name:string,sub:string,art:string,goal:string,star:number,pool:string[],orders:any[],terrain:any={},bases:any={},mats:any={普通:1},fins:any={普通:1},tools:any={})=>({key,ch,name,sub,art,goal,star,pool,orders,terrain,bases,mats,fins,tools});

const L:any[]=[
  lv('1-1',1,'清晨窗台','拖动贴入','晨光、窗台、植物、牛奶杯','贴入 4 张贴纸',10,
    ['strawberry','star','plant','flower'],
    [['place','贴入 4 张贴纸',4]],
    {masked:['0,0','0,1','0,2','0,3','0,4','0,5','1,0','1,5','2,0','2,5','3,0','3,5','4,0','4,5','5,0','5,5','6,0','6,5','7,0','7,1','7,2','7,3','7,4','7,5']},
    {2:['3,2','3,3','4,2','4,3']}),
  lv('1-2',1,'小卖部','旋转教学','冰柜、零食袋、饮料罐','贴入 2 张食物',12,
    ['strawberry','cherry','carousel','envelope'],
    [['food','贴入 2 张食物',2]],
    {masked:['0,0','0,5','1,5','2,5','3,5','4,5','5,5','6,5','7,0','7,1','7,2','7,3','7,4','7,5']},
    {2:['2,1','3,1','5,4']}),
  lv('1-3',1,'公园长椅','相邻收益','树荫、长椅、风线','触发 3 次相邻',18,
    ['cat','flower','plant','strawberry','envelope'],
    [['adjacent','相邻收益 3 次',3]],
    {masked:['3,2','4,2']},
    {2:['2,2','2,3','5,2','5,3']}),
  lv('1-4',1,'美食街','订单入门','灯串、菜单牌、夜市摊位','收集食物并相邻',26,
    ['strawberry','cake','cherry','cream','envelope','carousel'],
    [['food','收集 4 个食物',4],['adjacent','相邻收益 2 次',2]],
    {reward:['3,2']},
    {2:['2,1','2,2','2,3','3,1','3,3','4,2'],3:['3,2']}),
  lv('1-5',1,'音乐会','材质入门','舞台、灯球、票根','触发 2 次材质',30,
    ['star','music','ticket','strawberry'],
    [['material','材质触发 2 次',2]],
    {reward:['2,2','5,3']},
    {2:['2,1','2,3','4,2','4,3','5,2','5,4'],3:['2,2','5,3']},
    {普通:80,镭射:20}),
  lv('1-6',1,'夜市摊位','外观入门','招牌、亮片、霓虹边','触发 2 次外观',28,
    ['strawberry','ticket','balloon','star'],
    [['finish','外观触发 2 次',2],['high','命中高分格 1 次',1]],
    {reward:['1,4','4,1','6,3']},
    {2:['1,1','2,3','3,4','5,2','6,1','6,4'],3:['1,4','4,1','6,3']},
    {普通:1},{普通:80,金色闪粉:20}),
  lv('1-7',1,'海边步道','成长升级','海风、贝壳、晚霞','完成 1 次升级',34,
    ['cake','cat','shell','seagull','plant'],
    [['upgrade','同类相邻升级 1 次',1],['score','总分达到 34',34]],
    {reward:['3,2']},
    {2:['2,1','2,2','3,3','4,3','5,2'],3:['3,2']},
    {普通:80,布料:20},{普通:80,动态贴纸:20}),
  lv('1-8',1,'夏日广场','首章综合','喷泉、气球、小舞台、迷雾','完成 2 条订单',40,
    ['strawberry','cake','flower','ticket','balloon','music','star'],
    [['food','收集 3 个食物',3],['material','材质或外观 2 次',2]],
    {fog:['1,4','6,1'],reward:['3,2','3,3']},
    {2:['2,1','2,2','2,3','3,1','3,4','4,2'],3:['3,2','3,3']},
    {普通:60,镭射:20,水晶贴:10,磨砂:10},{普通:60,金色闪粉:15,荧光贴纸:15,彩色闪粉:10}),
  lv('2-1',2,'检票口','纸箱清障','检票栏、入口地贴','清除 2 个纸箱',24,
    ['carousel','envelope','ticket','star'],
    [['crate','清除 2 个纸箱',2]],
    {crate:['2,2','3,2']},
    {2:['1,2','1,3','4,2','5,2']},
    {普通:80,镭射:20},{普通:1},{scissors:28}),
  lv('2-2',2,'旋转木马','高分格教学','木马、灯圈、镀金细节','命中 3 个高分格',32,
    ['cream','strawberry','cherry','ticket','carousel'],
    [['high','命中高分格 3 次',3]],
    {reward:['2,2','4,3','5,1']},
    {2:['2,1','3,3','4,2','5,2','6,3','1,4'],3:['2,2','4,3','5,1']},
    {普通:60,水晶贴:25,烫金:15},{普通:80,金色闪粉:20}),
  lv('2-3',2,'气球摊','簇团邻接','气球束、条纹棚布','相邻收益 4 次',30,
    ['balloon','cat','flower','star','strawberry'],
    [['adjacent','相邻收益 4 次',4]],
    {masked:['0,5','7,0']},
    {2:['2,2','2,3','3,2','3,3','4,2'],3:['4,3','5,3']},
    {普通:55,泡泡贴:25,镭射:20},{普通:70,彩色闪粉:30}),
  lv('2-4',2,'冰淇淋车','污渍清理','餐车、价目牌、奶油色','收集食物并清污渍',34,
    ['strawberry','cake','cherry','cream','gummy'],
    [['food','收集 5 个食物',5],['stain','清理 1 个污渍',1]],
    {stain:['3,2'],reward:['2,4']},
    {2:['1,2','2,2','2,3','4,2','4,3','5,2'],3:['2,4']},
    {普通:60,磨砂:25,水晶贴:15},{普通:1},{eraser:18}),
  lv('2-5',2,'演出区','材质构筑','幕布、灯架、聚光灯','触发 3 次材质',36,
    ['music','ticket','star','carousel','daisy'],
    [['material','材质触发 3 次',3]],
    {reward:['3,3']},
    {2:['2,2','2,3','3,2','4,2','4,3','5,3'],3:['1,3','3,3']},
    {普通:50,镭射:25,烫金:25},{普通:80,金色闪粉:20}),
  lv('2-6',2,'玩偶车','海绵胶叠贴','货架、玩偶堆、展示车','使用海绵胶并叠贴',30,
    ['gift','gummy','daisy','strawberry','cat'],
    [['sponge','使用 1 次海绵胶',1],['stack','完成 1 次叠贴',1]],
    {masked:['0,0','0,1','1,0','6,5','7,4','7,5']},
    {2:['2,2','2,3','3,2','3,3','5,2','5,3']},
    {普通:70,泡泡贴:30},{普通:1},{sponge:30}),
  lv('2-7',2,'摩天轮下','中局成长','夜景、灯带、摩天轮','升级并触发材质',38,
    ['cake','cat','daisy','plant','flower'],
    [['upgrade','完成 1 次升级',1],['material','材质触发 2 次',2]],
    {reward:['2,2','5,3']},
    {2:['1,2','2,3','3,2','4,3','5,2','6,3'],3:['2,2','5,3']},
    {普通:50,布料:30,水晶贴:20},{普通:75,动态贴纸:25},{sponge:10}),
  lv('2-8',2,'烟花广场','第二章综合','烟花、庆典、舞台远景','材质清障海绵胶综合',44,
    ['strawberry','cake','music','ticket','daisy','gummy','star'],
    [['material','材质触发 2 次',2],['sponge','使用 1 次海绵胶',1],['crate','清除 1 个纸箱',1]],
    {crate:['2,2','5,3'],stain:['4,1'],reward:['3,3']},
    {2:['1,2','2,3','3,2','4,3','5,2','6,2','6,3'],3:['3,3']},
    {普通:40,镭射:15,烫金:20,磨砂:15,泡泡贴:10},{普通:65,金色闪粉:15,彩色闪粉:10,荧光贴纸:10},
    {sponge:12,eraser:8,scissors:8}),
];

// ===== 工具函数 =====
function rotShape(shape:Shape, rotation:number):Shape{
  let cells = shape.map(([r,c])=>[r,c]);
  const r = ((rotation/90)%4 + 4) % 4;
  for(let i=0;i<r;i++){
    cells = cells.map(([r,c])=>[c,-r]);
    const mr = Math.min(...cells.map(([r])=>r));
    const mc = Math.min(...cells.map(([,c])=>c));
    cells = cells.map(([r,c])=>[r-mr,c-mc]);
  }
  return cells;
}

// 计算贴纸异形 clip-path：根据 cells（左上对齐）和包围框尺寸生成 polygon 顶点串。
// 算法：构建 (rows+1) x (cols+1) 的网格顶点；对每条单元格边，若两侧只有一格属于贴纸则该边为外轮廓；
// 然后从任意外轮廓边出发按相邻顺序追踪，得到首尾相接的多边形顶点序列；输出 % 百分比。
function shapePolygon(cells:number[][]):string{
  if(!cells.length) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
  const rows = Math.max(...cells.map(([r])=>r))+1;
  const cols = Math.max(...cells.map(([,c])=>c))+1;
  const owned = new Set(cells.map(([r,c])=>`${r},${c}`));
  const has = (r:number,c:number)=>owned.has(`${r},${c}`);

  // 收集所有外轮廓边：(r1,c1)-(r2,c2) 的网格顶点对，方向规范化为左->右 / 上->下
  type Edge = { from:[number,number]; to:[number,number] };
  const edges:Edge[] = [];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(!has(r,c)) continue;
      // 上边：若上方无格 -> 顶点 (r,c)->(r,c+1)
      if(!has(r-1,c)) edges.push({from:[r,c], to:[r,c+1]});
      // 右边：若右方无格 -> 顶点 (r,c+1)->(r+1,c+1)
      if(!has(r,c+1)) edges.push({from:[r,c+1], to:[r+1,c+1]});
      // 下边：若下方无格 -> 顶点 (r+1,c+1)->(r+1,c)
      if(!has(r+1,c)) edges.push({from:[r+1,c+1], to:[r+1,c]});
      // 左边：若左方无格 -> 顶点 (r+1,c)->(r,c)
      if(!has(r,c-1)) edges.push({from:[r+1,c], to:[r,c]});
    }
  }
  if(!edges.length) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';

  // 按 from 建索引；从 edges[0] 起追踪
  const key = (p:[number,number])=>`${p[0]},${p[1]}`;
  const map = new Map<string,Edge>();
  edges.forEach(e=>map.set(key(e.from),e));

  const path:[number,number][] = [];
  let cur = edges[0];
  const startKey = key(cur.from);
  let safety = edges.length + 4;
  while(safety-- > 0){
    path.push(cur.from);
    const nextKey = key(cur.to);
    if(nextKey===startKey) break;
    const next = map.get(nextKey);
    if(!next) break;
    cur = next;
  }

  // 合并共线连续点（同行 / 同列），让 polygon 更简洁
  const simplified:[number,number][] = [];
  for(let i=0;i<path.length;i++){
    const prev = simplified[simplified.length-1];
    const cur2 = path[i];
    const next = path[(i+1)%path.length];
    if(prev && next){
      const colinear = (prev[0]===cur2[0] && cur2[0]===next[0]) || (prev[1]===cur2[1] && cur2[1]===next[1]);
      if(colinear) continue;
    }
    simplified.push(cur2);
  }
  const pts = (simplified.length>=3?simplified:path);

  // 转换成百分比；为了视觉留 2% 内缩边距让白边更柔和
  const pad = 0;
  const w = cols, h = rows;
  return 'polygon(' + pts.map(([r,c])=>{
    const x = (c/w)*100;
    const y = (r/h)*100;
    return `${(x+pad).toFixed(3)}% ${(y+pad).toFixed(3)}%`;
  }).join(', ') + ')';
}

// 计算视觉重心格（用于放置文字 / 角标）：取 cells 的几何中心格。
function shapeCenterCell(cells:number[][]):[number,number]{
  if(!cells.length) return [0,0];
  const rs = cells.map(([r])=>r);
  const cs = cells.map(([,c])=>c);
  const cr = (Math.min(...rs)+Math.max(...rs))/2;
  const cc = (Math.min(...cs)+Math.max(...cs))/2;
  // 选离中心最近的实际占格
  let best = cells[0]; let bestD = Infinity;
  cells.forEach(([r,c])=>{
    const d = (r-cr)*(r-cr) + (c-cc)*(c-cc);
    if(d<bestD){ bestD=d; best=[r,c]; }
  });
  return best as [number,number];
}
function normalizedShapeBounds(shape: Shape) {
  const minR = Math.min(...shape.map(([r]) => r));
  const minC = Math.min(...shape.map(([, c]) => c));
  const cells = shape.map(([r, c]) => [r - minR, c - minC] as [number, number]);
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  return { cells, rows, cols };
}
function shapeLayout(shape: Shape, rotation: number) {
  const rotated = normalizedShapeBounds(rotShape(shape, rotation));
  return {
    cells: rotated.cells,
    rows: rotated.rows,
    cols: rotated.cols,
  };
}
function shapeVisualBox(shape: Shape, rotation:number){
  const base = normalizedShapeBounds(shape);
  const layout = shapeLayout(shape, rotation);
  const widthScale = base.cols / layout.cols;
  const heightScale = base.rows / layout.rows;
  return {
    width: `${widthScale * 100}%`,
    height: `${heightScale * 100}%`,
  };
}
function choose(w:any, fb:string, seed:number){
  const e = Object.entries(w||{}).filter(([,v])=>Number(v)>0) as [string,number][];
  if(!e.length) return fb;
  const t = e.reduce((s,[,v])=>s+Number(v),0);
  let c = Math.abs(seed*31+7)%t;
  for(const [k,v] of e){ if(c<v) return k; c -= v; }
  return e[0][0];
}
function StickerRender({
  asset,
  alt,
  rotation,
  visualBox,
  shapeClip,
  material,
  finish,
  animationFrames,
  variant,
  valid = true,
}: {
  asset:string;
  alt:string;
  rotation:number;
  visualBox:{width:string;height:string};
  shapeClip:string;
  material?:string;
  finish?:string;
  animationFrames?:string[];
  variant:'placed'|'ghost';
  valid?:boolean;
}) {
  const { materialClass: matClass, finishClass: finClass } = getStickerVariantDecoClasses(
    (material as StickerMaterialKey | undefined) || undefined,
    (finish as StickerFinishKey | undefined) || undefined,
  );
  return <div
    className="sticker-render"
    data-variant={variant}
    data-valid={valid ? 'true' : 'false'}
    style={{
      ['--sticker-mask' as any]: `url("${asset}")`,
      ['--sticker-mask-size' as any]: '100% 100%',
      ['--art-rot' as any]: `${rotation || 0}deg`,
      ['--shape-clip' as any]: shapeClip,
      width: visualBox.width,
      height: visualBox.height,
    } as React.CSSProperties}
  >
    <div className="sticker-render-shadow"/>
    <div className="sticker-render-paper"/>
    {animationFrames?.length ? <div className="sticker-render-animation" aria-hidden="true">
      {animationFrames.map((frame,index)=><img key={`${asset}-${frame}-${index}`} className="sticker-render-frame" src={frame} alt="" draggable={false} style={{animationDelay:`-${(index/animationFrames.length)*1.1}s`}}/>) }
    </div> : <img className="sticker-render-image" src={asset} alt={alt} draggable={false}/>}
    {matClass && <div className={matClass}/>}
    {finClass && <div className={finClass}/>}
  </div>;
}
function boardOf(level:any){
  const b = Array.from({length:ROWS},()=>Array.from({length:COLS},()=>({terrain:'normal' as Terrain,base:1,stickerId:null as string|null,stackId:null as string|null,sponge:false})));
  Object.entries(level.bases).forEach(([score,cells]:any)=>cells.forEach((x:string)=>{const[r,c]=x.split(',').map(Number);if(b[r]?.[c])b[r][c].base=Number(score);}));
  Object.entries(level.terrain).forEach(([terrain,cells]:any)=>cells.forEach((x:string)=>{const[r,c]=x.split(',').map(Number);if(b[r]?.[c])b[r][c].terrain=terrain as Terrain;}));
  return b;
}
function cand(level:any, seed:number){
  const toolTotal = Object.values(level.tools||{}).reduce((a:any,b:any)=>a+Number(b),0) as number;
  if(toolTotal && Math.abs(seed*17)%100<toolTotal){
    const id = choose(level.tools,'sponge',seed) as keyof typeof T;
    return { kind:'tool', instanceId:`tool-${id}-${seed}-${Date.now()}`, ...T[id] };
  }
  const base = S.find(s=>s.id===level.pool[Math.abs(seed*5+1)%level.pool.length]) || S[0];
  return {
    id: base.id, name: base.name, type: base.type,
    shapeKey: base.shapeKey, shape: SHAPES[base.shapeKey],
    asset: base.asset, note: base.note, kind:'sticker' as const,
    instanceId:`sticker-${base.id}-${seed}-${Date.now()}`,
    material: choose(level.mats,'普通',seed) as MaterialKey,
    finish: choose(level.fins,'普通',seed+9) as FinishKey,
    rotation: 0,
  };
}
function load(){
  try {
    const raw = acctGetItem(KEY);
    return (raw && JSON.parse(raw)) || {bestScore:0,highestLevel:0,collection:[],cleared:[],diaryPages:1,storyStars:{},starBalance:0,shopPurchases:[]};
  }
  catch { return {bestScore:0,highestLevel:0,collection:[],cleared:[],diaryPages:1,storyStars:{},starBalance:0,shopPurchases:[]}; }
}

function Pill({label,value}:{label:string;value:any}){return <div className="rounded-2xl bg-white/80 px-3 py-2 text-center shadow"><div className="text-[11px] font-black text-[#9B7D62]">{label}</div><div className="text-lg font-black text-[#594A3C]">{value}</div></div>;}

const SHOP_ITEMS = [
  { id:'shop-mystery-pack', name:'神秘贴纸包', price:12, desc:'先作为商店占位商品，后续可扩充为关外解锁的新贴纸包。' },
  { id:'shop-gold-foil-box', name:'闪耀素材盒', price:20, desc:'先作为占位商品，后续可扩充为限定材质或外观内容。' },
  { id:'shop-diary-deco-set', name:'手账装饰组', price:28, desc:'先作为占位商品，后续可扩充为日记模式专属装饰贴纸。' },
] as const;

/**
 * 计分小卡：等宽 (由父级 .score-row grid 控制)，数值变化时触发 .score-bump 动画。
 * - variant='total' 时使用更大字号 + 暖金渐变底色，作为公式右侧高亮结果；
 * - 值从 0→0 不触发动画；其余每次变化（包括减分）都用递增 nonce 重启 keyframes，
 *   保证连续连击不会被"动画已运行中"忽略；
 * - onAnimationEnd 移除 .score-bump 类，让下一次值变化能再次触发。
 */
function ScoreTile({label,value,variant}:{label:string;value:number;variant?:'total'|'base'|'pattern'|'special'}){
  const prevRef = useRef<number>(value);
  const [bumpKey,setBumpKey] = useState<number>(0);
  useEffect(()=>{
    if(prevRef.current !== value){
      // 0 → 0 不触发；其它变化都重启动画
      if(!(prevRef.current === 0 && value === 0)){
        setBumpKey(k=>k+1);
      }
      prevRef.current = value;
    }
  },[value]);
  const isTotal = variant === 'total';
  return (
    <div className={`score-tile${isTotal?' score-tile-total':''}${variant==='base'?' score-tile-base':''}${variant==='pattern'?' score-tile-pattern':''}${variant==='special'?' score-tile-special':''}`}>
      <div className="score-tile-label">{label}</div>
      <div className="score-tile-value-wrap">
        <span
          key={bumpKey}
          className={bumpKey>0 ? `score-tile-value ${isTotal?'score-bump-total':'score-bump'}` : 'score-tile-value'}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
function ProgressBar({order}:{order:any}){const pct=Math.min(100,Math.round(order.progress/order.target*100));return <div className="rounded-2xl bg-white/70 p-3 shadow-inner"><div className="mb-2 flex justify-between text-xs font-black"><span>{order.label}</span><span>{Math.min(order.progress,order.target)} / {order.target}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#F4E1C8]"><div className="h-full rounded-full bg-gradient-to-r from-[#9EE6C9] to-[#F7C948]" style={{width:`${pct}%`}} /></div></div>;}

function Home({progress,onEnter,account,onAccountChange}:any){
  const cards=[
    ['story', BookOpen, '剧情手账',
      '从清晨窗台贴到烟花广场，跟着剧情解锁 16 关手账日常，一关一个小温暖。',
      '#FFB7C5'],
    ['party', PartyPopper, '派对高分',
      '随机生成的轻肉鸽层层挑战：每层订单和棋盘都不同，越往上爆分越爽，还能掉落稀有材质。',
      '#9EE6C9'],
    ['diary', PenLine, '日记创作',
      '没有分数和回合限制，把已解锁的贴纸自由摆进日记本，做属于你自己的治愈手账。',
      '#A7D8FF'],
  ];
  const totalStars = Object.values(progress.storyStars || {}).reduce((sum:number,value:any)=>sum + Number(value || 0), 0);
  return <section className="relative flex flex-1 flex-col justify-center py-8">
    <div className="absolute right-0 top-0 flex items-center gap-3">
      <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-black shadow">⭐ 星星 {progress.starBalance || 0}</div>
      <button onClick={()=>{ onEnter('shop'); }} className="inline-flex items-center gap-2 rounded-full bg-[#FFF7E8] px-4 py-2 text-sm font-black text-[#594A3C] shadow transition hover:-translate-y-0.5 hover:shadow-md">
        <ShoppingBag className="h-4 w-4"/>商店
      </button>
    </div>
    <div className="mx-auto mb-8 max-w-4xl text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-black shadow">
        <Sparkles className="h-4 w-4 text-[#F7C948]" />手账拼贴 × 空间规划 × 轻肉鸽构筑
      </div>
      {/* 大标题：账户头像贴纸放在标题外侧（左侧），不覆盖文字。
          外层 flex inline-flex 让贴纸 + 标题作为一组水平居中；
          gap 控制贴纸和标题的间距；标题保持原字号居中视觉。 */}
      <div className="mt-5 flex items-center justify-center gap-3 sm:gap-5">
        <AccountBadge
          account={account}
          onChanged={onAccountChange}
          size="lg"
          className="account-sticker-title"
        />
        <h1 className="text-5xl font-black md:text-7xl">开心贴贴账</h1>
      </div>
      <p className="mx-auto mt-4 max-w-2xl text-lg font-bold text-[#7A6958]">贴一张、嵌一格，凑出你的小确幸 ── 18 张贴纸 · 7 种材质 · 5 种外观，三乘区爆分一气呵成。</p>
    </div>
    <div className="grid gap-5 md:grid-cols-3">
      {cards.map(([m,I,t,txt,color]:any)=>(
        <button key={m} onClick={()=>onEnter(m)} className="book-card text-left" style={{'--book-color':color} as any}>
          <span className="book-spine" />
          <div className="relative z-10 flex h-full flex-col justify-between p-7 pl-16">
            <I className="h-12 w-12 text-[#594A3C]" />
            <div><h2 className="text-3xl font-black">{t}</h2><p className="mt-3 text-sm font-bold leading-6">{txt}</p></div>
          </div>
        </button>
      ))}
    </div>
    <div className="mx-auto mt-8 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
      <Pill label="最高分" value={progress.bestScore}/>
      <Pill label="已通关" value={`${progress.cleared.length}/16`}/>
      <Pill label="已收集星星" value={totalStars}/>
      <Pill label="商店持有" value={(progress.shopPurchases || []).length}/>
    </div>
  </section>;
}

// 章节元信息（用于剧情目录分组展示）— 配色取自游戏主调色板：奶油黄/粉橘/薄荷/天蓝/暖金
const CHAPTER_META: Record<number,{title:string;desc:string;accent:string;icon:string}> = {
  1: { title:'第一章 · 暑期手账', desc:'从清晨窗台到夏日小卖部，循序贴入第一组贴纸。', accent:'#FFB7C5', icon:'☀️' },
  2: { title:'第二章 · 游乐场', desc:'旋转木马与烟花广场，挑战材质与外观加成。', accent:'#A7D8FF', icon:'🎡' },
};

function StoryLevelSelect({levels,progress,onSelect,onBack}:{levels:any[];progress:any;onSelect:(idx:number)=>void;onBack:()=>void}){
  const cleared:string[] = progress.cleared || [];
  const storyStars = progress.storyStars || {};
  const highest:number = Math.min(progress.highestLevel||0, levels.length-1);
  const isUnlockedIdx = (i:number)=>{
    if(i===0) return true;
    if(i<=highest) return true;
    const prev = levels[i-1];
    return prev && cleared.includes(prev.key);
  };
  const currentIdx = levels.findIndex((lv,i)=>isUnlockedIdx(i) && !cleared.includes(lv.key));
  const clearedCount = levels.filter(lv=>cleared.includes(lv.key)).length;
  const allCleared = clearedCount >= levels.length;
  const quickTargetIdx = allCleared ? levels.length-1 : (currentIdx>=0 ? currentIdx : 0);
  const quickTarget = levels[quickTargetIdx];

  // 按 chapter 分组，保持原始顺序
  const groupsMap = new Map<number, {idx:number; lv:any}[]>();
  levels.forEach((lv:any,idx:number)=>{
    if(!groupsMap.has(lv.ch)) groupsMap.set(lv.ch, []);
    groupsMap.get(lv.ch)!.push({idx, lv});
  });
  const groups = Array.from(groupsMap.entries()).sort((a,b)=>a[0]-b[0]);

  return <section className="story-menu-page flex flex-1 flex-col py-6">
    <div className="mx-auto w-full max-w-6xl px-2">
      {/* 顶部：返回 + 标题 + 进度 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-full bg-white/90 px-4 py-2 text-sm font-black shadow-sm hover:bg-white border border-[#E8E1D6]">← 返回主菜单</button>
        <div className="text-center">
          <h2 className="text-3xl font-black text-[#594A3C] md:text-4xl">剧情章节目录</h2>
          <p className="mt-1 text-sm font-bold text-[#9B7D62]">按章节查看关卡进度</p>
        </div>
        <Pill label="通关进度" value={`${clearedCount}/${levels.length}`}/>
      </div>

      {/* 快速入口：扁平卡片式 */}
      <div className="mb-8 flex justify-center">
        <button
          type="button"
          onClick={()=> onSelect(quickTargetIdx)}
          className="quick-resume w-full max-w-2xl text-left"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-wider text-[#C68A2E]">{allCleared?'全部通关':'继续挑战'}</span>
              <span className="mt-1 text-xl font-black text-[#594A3C]">第 {quickTarget?.ch} 章 · {quickTarget?.key} {quickTarget?.name}</span>
              <span className="mt-1 text-xs font-bold text-[#7A6958]">{quickTarget?.sub} · 目标：{quickTarget?.goal}</span>
            </div>
            <span className="quick-resume-btn">{allCleared?'重玩最后一关':'立即开始'} →</span>
          </div>
        </button>
      </div>

      {/* 章节分组 */}
      <div className="space-y-8">
        {groups.map(([chapter, items])=>{
          const meta = CHAPTER_META[chapter] || { title:`第 ${chapter} 章`, desc:'', accent:'#F7C948' };
          const chapClearedCount = items.filter(it=>cleared.includes(it.lv.key)).length;
          return <div key={chapter} className="chapter-section">
            <div className="chapter-header" style={{ '--chapter-accent': meta.accent } as any}>
              <span className="chapter-accent-bar" aria-hidden />
              <span className="chapter-icon" aria-hidden>{(meta as any).icon || '✨'}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-black text-[#594A3C] tracking-wide md:text-2xl">{meta.title}</h3>
                {meta.desc && <p className="mt-1 text-xs font-bold text-[#7A6958] md:text-sm">{meta.desc}</p>}
              </div>
              <span className="chapter-progress">{chapClearedCount}/{items.length}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map(({idx:i, lv})=>{
                const unlocked = isUnlockedIdx(i);
                const isCleared = cleared.includes(lv.key);
                const isCurrent = i===currentIdx;
                const stateMod = !unlocked ? 'is-locked' : isCurrent ? 'is-current' : isCleared ? 'is-cleared' : 'is-normal';
                const earnedStars = Math.max(0, Math.min(3, Number(storyStars[lv.key] || 0)));
                const coverUrl = STORY_COVERS[lv.key];
                return <button
                  key={lv.key}
                  type="button"
                  disabled={!unlocked}
                  onClick={()=> unlocked && onSelect(i)}
                  className={`story-level-card ${stateMod}`}
                >
                  {isCurrent && <span className="card-badge card-badge-new">✨ NEW</span>}
                  {isCleared && !isCurrent && <span className="card-badge card-badge-done">⭐ 已通关</span>}
                  {!unlocked && <span className="card-badge card-badge-lock">🔒 锁定</span>}

                  <div className="card-cover" aria-hidden>
                    {coverUrl ? (
                      <img src={coverUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="card-cover-placeholder" />
                    )}
                    {!unlocked && <div className="card-cover-mask" />}
                  </div>

                  <div className="card-body">
                    <div className="card-meta">{lv.key}</div>
                    <h4 className="card-title">{lv.name}</h4>
                    <p className="card-sub">{lv.sub} · {lv.art}</p>
                    <div className="card-footer">
                      <span>目标：{lv.goal}</span>
                      <span className="card-stars">{'★'.repeat(earnedStars)}{'☆'.repeat(3-earnedStars)}</span>
                    </div>
                  </div>
                </button>;
              })}
            </div>
          </div>;
        })}
      </div>
    </div>
  </section>;
}

function ShopPage({progress,onBack,onBuy}:{progress:any;onBack:()=>void;onBuy:(itemId:string)=>void}){
  const purchased:string[] = progress.shopPurchases || [];
  const starBalance = Number(progress.starBalance || 0);
  return <section className="flex flex-1 flex-col py-6">
    <div className="mx-auto w-full max-w-5xl px-2">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-full bg-white/90 px-4 py-2 text-sm font-black shadow-sm hover:bg-white border border-[#E8E1D6]">← 返回主菜单</button>
        <div className="text-center">
          <h2 className="text-3xl font-black text-[#594A3C] md:text-4xl">星星商店</h2>
          <p className="mt-1 text-sm font-bold text-[#9B7D62]">通过剧情手账通关评星收集星星，在这里兑换关外内容。</p>
        </div>
        <Pill label="当前星星" value={starBalance}/>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {SHOP_ITEMS.map(item=>{
          const owned = purchased.includes(item.id);
          const affordable = starBalance >= item.price;
          return <article key={item.id} className="rounded-[2rem] border-4 border-white bg-white/80 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-2xl bg-[#FFF7E8] p-3 text-3xl">🛍️</div>
              <span className="rounded-full bg-[#FFF1B8] px-3 py-1 text-sm font-black text-[#8D6200]">⭐ {item.price}</span>
            </div>
            <h3 className="mt-4 text-2xl font-black text-[#594A3C]">{item.name}</h3>
            <p className="mt-2 min-h-[72px] text-sm font-bold leading-6 text-[#7A6958]">{item.desc}</p>
            <button
              type="button"
              disabled={owned || !affordable}
              onClick={()=>onBuy(item.id)}
              className={`mt-5 w-full rounded-2xl py-3 font-black shadow ${owned ? 'cursor-default bg-[#EDE3D2] text-[#9B7D62]' : affordable ? 'bg-gradient-to-r from-[#F7C948] to-[#FFB7C5] text-[#594A3C]' : 'cursor-not-allowed bg-[#EFE3CF] text-[#A89A82]'}`}
            >
              {owned ? '已购买' : affordable ? '购买' : '星星不足'}
            </button>
          </article>;
        })}
      </div>
    </div>
  </section>;
}

type DiaryItem = { id:string; kind:'text'|'sticker'; x:number; y:number; rotation:number; scale:number; content?:string; asset?:string; name?:string; material?:CMaterial; finish?:CFinish };

// 贴纸图鉴页：展示 18 张贴纸 × 材质 × 外观矩阵，已解锁/未解锁分别样式
function StickerCodex({unlocks,onClose}:{unlocks:string[];onClose:()=>void}){
  const [zoomSrc,setZoomSrc] = useState<string|null>(null);
  const [zoomAlt,setZoomAlt] = useState<string>('');
  const [zoomMaterial,setZoomMaterial] = useState<CMaterial|undefined>(undefined);
  const [zoomFinish,setZoomFinish] = useState<CFinish|undefined>(undefined);
  const [zoomStickerId,setZoomStickerId] = useState<string|null>(null);
  const [pickedId,setPickedId] = useState<string>(ALL_STICKER_IDS[0]);
  const picked = S.find(s=>s.id===pickedId);
  const closeZoom = ()=>{
    setZoomSrc(null);
    setZoomMaterial(undefined);
    setZoomFinish(undefined);
    setZoomStickerId(null);
  };

  return <div className="codex-mask" onClick={zoomSrc ? closeZoom : onClose}>
    <div className="codex-modal" onClick={(e)=>e.stopPropagation()}>
      <div className="codex-header">
        <h2>贴纸图鉴</h2>
        <p>解锁更多版本：在派对高分模式中通关每一层都有概率掉落新贴纸版本。</p>
        <button className="codex-close" onClick={onClose} aria-label="关闭"><X className="h-4 w-4"/></button>
      </div>
      <div className="codex-body">
        <div className="codex-list">
          {ALL_STICKER_IDS.map(id=>{
            const s = S.find(x=>x.id===id);
            if(!s) return null;
            const revealed = isStickerCodexRevealed(unlocks, id);
            const {unlocked,total} = countStickerUnlocks(unlocks,id);
            return <button key={id} className={`codex-card ${pickedId===id?'active':''}`} onClick={()=>setPickedId(id)}>
              <div className="codex-card-art"><img src={s.asset} alt={revealed?s.name:'未揭示贴纸'} draggable={false} className={revealed?'':'codex-hidden-art'}/></div>
              <div className="codex-card-info">
                <strong>{revealed?s.name:'？？？'}</strong>
                <span className={unlocked===total?'full':''}>{unlocked}/{total}</span>
              </div>
            </button>;
          })}
        </div>
        <div className="codex-detail">
          {picked && <>
            {(() => {
              const revealed = isStickerCodexRevealed(unlocks, picked.id);
              return <>
            <div className="codex-detail-head">
              <img src={picked.asset} alt={revealed?picked.name:'未揭示贴纸'} className={revealed?'':'codex-hidden-art'}/>
              <div>
                <h3>{revealed?picked.name:'？？？'}</h3>
                <p>{revealed?`${picked.note} · 形状：${SHAPE_LABEL[picked.shapeKey]||''}`:'触发对应拓扑升级后揭示。'}</p>
              </div>
            </div>
            <div className="codex-matrix">
              <div className="codex-matrix-head" style={{ gridTemplateColumns: `80px repeat(${CODEX_FINISHES.length}, minmax(0, 1fr))` }}>
                <span></span>
                {CODEX_FINISHES.map(f=><span key={f}>{f}</span>)}
              </div>
              {CODEX_MATERIALS.map(m=>(
                <div key={m} className="codex-matrix-row" style={{ gridTemplateColumns: `80px repeat(${CODEX_FINISHES.length}, minmax(0, 1fr))` }}>
                  <span className="codex-matrix-rowname">{m}</span>
                  {CODEX_FINISHES.map(f=>{
                    const ok = revealed && isUnlocked(unlocks, picked.id, m as CMaterial, f as CFinish);
                    const variantLabel = `${picked.name} · ${m}/${f}`;
                    return <div key={f} className={`codex-cell ${ok?'unlocked':'locked'}`}>
                      <div
                        className="codex-cell-art"
                        role={ok?'button':undefined}
                        tabIndex={ok?0:-1}
                        style={{cursor: ok?'zoom-in':'default', ['--sticker-mask' as any]: `url("${picked.asset}")`} as React.CSSProperties}
                        onClick={ok?(e)=>{ e.stopPropagation(); setZoomSrc(picked.asset); setZoomAlt(variantLabel); setZoomMaterial(m as CMaterial); setZoomFinish(f as CFinish); setZoomStickerId(picked.id); }:undefined}
                        onKeyDown={ok?(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); setZoomSrc(picked.asset); setZoomAlt(variantLabel); setZoomMaterial(m as CMaterial); setZoomFinish(f as CFinish); setZoomStickerId(picked.id); } }:undefined}
                      >
                        <img src={picked.asset} alt={revealed?picked.name:'未揭示贴纸'} draggable={false} className={ok?'':'codex-hidden-art'}/>
                        {ok && (()=>{
                          const { materialClass, finishClass } = getStickerVariantDecoClasses(m as CMaterial, f as CFinish);
                          return <>
                            {materialClass && <div className={materialClass}/>}
                            {finishClass && <div className={finishClass}/>}
                          </>;
                        })()}
                        {!ok && <Lock className="codex-lock-icon h-5 w-5"/>}
                      </div>
                      <span className="codex-cell-tag">{ok?'已解锁':'未解锁'}</span>
                    </div>;
                  })}
                </div>
              ))}
            </div>
            </>;
            })()}
          </>}
        </div>
      </div>
    </div>
    <StickerLightbox src={zoomSrc} alt={zoomAlt} material={zoomMaterial as any} finish={zoomFinish as any} stickerId={zoomStickerId} onClose={closeZoom}/>
  </div>;
}

// 日记页标题改为「日期 + 星期几」实时展示，不再使用可编辑标题/副标题。
// 旧的 diary.title.v1 / diary.subtitle.v1 持久化字段不再使用，保留 key 名仅作历史兼容。
const WEEKDAY_CN = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
function formatDiaryHeaderDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = WEEKDAY_CN[d.getDay()];
  return `${y}年${m}月${day}日 ${w}`;
}

function Diary({onBack,onPublish,unlocks}:{onBack:()=>void;onPublish:()=>void;unlocks:string[]}){
  const [items,setItems] = useState<DiaryItem[]>([]);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [codexOpen,setCodexOpen] = useState(false);
  const [boxToast,setBoxToast] = useState<string>('');
  const [bookOpen,setBookOpen] = useState<boolean>(false);
  // 标题：日期 + 星期几（页面打开时计算一次，不实时刷新）
  const [headerDate] = useState<string>(()=>formatDiaryHeaderDate());
  // 历史发布数量（驱动 "我的手账本(N)" 角标）
  const [bookCount,setBookCount] = useState<number>(()=>loadDiaryBook().length);
  // 发布提示
  const [publishToast,setPublishToast] = useState<string>('');
  const paperRef = useRef<HTMLDivElement|null>(null);
  const dragInfo = useRef<{id:string;offsetX:number;offsetY:number}|null>(null);

  // 贴纸盒条目：列出 18 张贴纸 × 已解锁 (material,finish) 版本（去重，每个贴纸至少展示「普通/普通」）
  type BoxEntry = { id:string; name:string; asset:string; material:CMaterial; finish:CFinish; unlocked:boolean };
  const boxEntries: BoxEntry[] = useMemo(()=>{
    const out: BoxEntry[] = [];
    ALL_STICKER_IDS.forEach(id=>{
      const s = S.find(x=>x.id===id);
      if(!s) return;
      CODEX_MATERIALS.forEach(m=>{
        CODEX_FINISHES.forEach(f=>{
          const ok = isUnlocked(unlocks, id, m as CMaterial, f as CFinish);
          out.push({ id, name:s.name, asset:s.asset, material:m as CMaterial, finish:f as CFinish, unlocked:ok });
        });
      });
    });
    // 排序：已解锁优先，然后按 id 顺序
    return out.sort((a,b)=>{
      if(a.unlocked!==b.unlocked) return a.unlocked?-1:1;
      return ALL_STICKER_IDS.indexOf(a.id)-ALL_STICKER_IDS.indexOf(b.id);
    });
  },[unlocks]);

  const newId = ()=>`d-${Date.now()}-${Math.floor(Math.random()*9999)}`;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 2.5;
  const clampScale = (s:number)=> Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));
  const addText = ()=>{
    const id = newId();
    const rect = paperRef.current?.getBoundingClientRect();
    const x = rect ? rect.width/2 - 80 : 100;
    const y = rect ? rect.height/2 - 30 : 100;
    setItems(cur=>[...cur,{id,kind:'text',x,y,rotation:0,scale:1,content:'双击编辑文字'}]);
    setSelectedId(id);
  };
  const onPaperDragOver = (e:React.DragEvent)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const onPaperDrop = (e:React.DragEvent)=>{
    e.preventDefault();
    const rect = paperRef.current?.getBoundingClientRect();
    if(!rect) return;
    const data = e.dataTransfer.getData('application/diary-sticker');
    if(data){
      try{
        const parsed = JSON.parse(data);
        const id = newId();
        const x = e.clientX - rect.left - 36;
        const y = e.clientY - rect.top - 36;
        setItems(cur=>[...cur,{id,kind:'sticker',x,y,rotation:0,scale:1,asset:parsed.asset,name:parsed.name,material:parsed.material,finish:parsed.finish}]);
        setSelectedId(id);
      }catch{ /* ignore */ }
    }
  };
  const onItemMouseDown = (e:React.MouseEvent,item:DiaryItem)=>{
    if(editingId===item.id) return;
    e.stopPropagation();
    setSelectedId(item.id);
    const rect = paperRef.current?.getBoundingClientRect();
    if(!rect) return;
    dragInfo.current = { id:item.id, offsetX: e.clientX - rect.left - item.x, offsetY: e.clientY - rect.top - item.y };
    const onMove = (ev:MouseEvent)=>{
      if(!dragInfo.current||!paperRef.current) return;
      const r = paperRef.current.getBoundingClientRect();
      const info = dragInfo.current;
      const nx = ev.clientX - r.left - info.offsetX;
      const ny = ev.clientY - r.top - info.offsetY;
      const targetId = info.id;
      const w = r.width;
      const h = r.height;
      setItems(cur=>cur.map(it=>it.id===targetId?{...it,x:Math.max(0,Math.min(w-20,nx)),y:Math.max(0,Math.min(h-20,ny))}:it));
    };
    const onUp = ()=>{ dragInfo.current=null; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  };
  const rotateItem = (id:string)=> setItems(cur=>cur.map(it=>it.id===id?{...it,rotation:(it.rotation+15)%360}:it));
  const deleteItem = (id:string)=> { setItems(cur=>cur.filter(it=>it.id!==id)); if(selectedId===id) setSelectedId(null); if(editingId===id) setEditingId(null); };
  const updateText = (id:string,content:string)=> setItems(cur=>cur.map(it=>it.id===id?{...it,content}:it));
  const newPage = ()=>{ setItems([]); setSelectedId(null); setEditingId(null); };
  // 发布：把当前日记页保存为一条新 entry，追加到 localStorage 列表
  const publishToBook = ()=>{
    const snapshot:DiaryItemSnapshot[] = items.map(it=>({
      id: it.id,
      kind: it.kind,
      x: it.x,
      y: it.y,
      rotation: it.rotation,
      scale: it.scale,
      content: it.content,
      asset: it.asset,
      name: it.name,
      material: it.material,
      finish: it.finish,
    }));
    const entry:DiaryEntry = {
      id: `entry-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      publishedAt: new Date().toISOString(),
      title: headerDate,
      items: snapshot,
    };
    const next = appendDiaryEntry(entry);
    setBookCount(next.length);
    onPublish();
    setPublishToast(`已发布 1 份手账（共 ${next.length} 份）`);
    setTimeout(()=>setPublishToast(''),2200);
  };
  const adjustScale = (id:string,delta:number)=> setItems(cur=>cur.map(it=>it.id===id?{...it,scale:clampScale((it.scale||1)+delta)}:it));
  // 右下角拖拽手柄缩放：基于初始距离与初始 scale 计算缩放因子
  const onResizeMouseDown = (e:React.MouseEvent,item:DiaryItem)=>{
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startScale = item.scale || 1;
    // 用对角线距离来作为基准（初始大约 50px，缩放手柄相对于贴纸中心）
    const baseDist = Math.max(40, Math.hypot(36*startScale, 36*startScale));
    const onMove = (ev:MouseEvent)=>{
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const delta = (dx + dy) / 2; // 平均位移更稳
      const next = clampScale(startScale + delta / baseDist);
      setItems(cur=>cur.map(it=>it.id===item.id?{...it,scale:next}:it));
    };
    const onUp = ()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  };

  return <section className="grid flex-1 gap-4 py-5 lg:grid-cols-[1fr_400px]">
    <div className="min-w-0 rounded-[2.5rem] border-4 border-white bg-[#FFFDF7]/90 p-5 shadow-2xl">
      <button onClick={onBack} className="mb-4 rounded-full bg-white px-4 py-2 font-black shadow">返回首页</button>
      <h2 className="text-4xl font-black">{headerDate}</h2>
      <p className="mt-2 font-bold text-[#7A6958]">日记模式 · 自由创作</p>
      <div ref={paperRef} className="diary-paper mt-5 relative" onDragOver={onPaperDragOver} onDrop={onPaperDrop} onClick={()=>{setSelectedId(null);setEditingId(null);}}>
        {items.map(item=>{
          const isSel = selectedId===item.id;
          const isEdit = editingId===item.id;
          const sc = item.scale || 1;
          // 日记中只用做 UI 渲染，不参与计分
          const { materialClass: decoMat, finishClass: decoFin } = item.kind==='sticker'
            ? getStickerVariantDecoClasses(item.material as StickerMaterialKey | undefined, item.finish as StickerFinishKey | undefined)
            : { materialClass:'', finishClass:'' };
          return <div key={item.id} className={`diary-item ${isSel?'selected':''}`} style={{left:item.x,top:item.y,transform:`rotate(${item.rotation}deg) scale(${sc})`,transformOrigin:'top left'}} onMouseDown={(e)=>onItemMouseDown(e,item)} onClick={(e)=>{e.stopPropagation();setSelectedId(item.id);}} onDoubleClick={(e)=>{ if(item.kind==='text'){e.stopPropagation();setEditingId(item.id);} }}>
            {item.kind==='sticker' ? <div className="diary-item-sticker-wrap" style={{ ['--sticker-mask' as any]: `url("${item.asset}")` } as React.CSSProperties}>
                <img src={item.asset} alt={item.name} draggable={false} className="diary-item-sticker"/>
                {decoMat && <div className={decoMat}/>}
                {decoFin && <div className={decoFin}/>}
              </div> :
              isEdit ? <textarea autoFocus value={item.content||''} onChange={(e)=>updateText(item.id,e.target.value)} onBlur={()=>setEditingId(null)} onMouseDown={(e)=>e.stopPropagation()} className="diary-text-edit"/> :
              <div className="diary-text">{item.content||'双击编辑文字'}</div>
            }
            {isSel && !isEdit && <div className="diary-item-tools" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
              <button title="旋转" onClick={()=>rotateItem(item.id)}><RotateCw className="h-3 w-3"/></button>
              {item.kind==='sticker' && <>
                <button title="缩小" onClick={()=>adjustScale(item.id,-0.1)} disabled={sc<=SCALE_MIN+0.001}>−</button>
                <button title="放大" onClick={()=>adjustScale(item.id,0.1)} disabled={sc>=SCALE_MAX-0.001}>＋</button>
              </>}
              {item.kind==='text' && <button title="编辑" onClick={()=>setEditingId(item.id)}><PenLine className="h-3 w-3"/></button>}
              <button title="删除" onClick={()=>deleteItem(item.id)}><Trash2 className="h-3 w-3"/></button>
            </div>}
            {isSel && !isEdit && item.kind==='sticker' && <div className="diary-item-resize" title="拖拽缩放" onMouseDown={(e)=>onResizeMouseDown(e,item)}/>}
          </div>;
        })}
      </div>
      {/* 日记纸下方的操作条：发布 / 新的一页（按用户标注图，从工具箱迁移到此处） */}
      <div className="diary-action-bar mt-4 flex flex-wrap items-center gap-3">
        <button onClick={publishToBook} className="diary-action-btn flex-1 rounded-2xl bg-[#FFB7C5] py-3 font-black shadow hover:brightness-105 active:translate-y-[1px]">发布到本地手账</button>
        <button onClick={newPage} className="diary-action-btn flex-1 rounded-2xl bg-[#9EE6C9] py-3 font-black shadow hover:brightness-105 active:translate-y-[1px]">新的一页</button>
      </div>
      {publishToast && <div className="mt-2 rounded-xl bg-[#FFE4A0] px-3 py-2 text-sm font-black text-[#594A3C]">{publishToast}</div>}
    </div>
    <aside className="space-y-4 rounded-[2.5rem] border-4 border-white bg-white/80 p-4 shadow-2xl">
      <h3 className="text-2xl font-black">创作工具箱</h3>
      <button onClick={addText} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#A7D8FF] py-3 font-black shadow hover:bg-[#8FC7F5]"><Type className="h-5 w-5"/>添加文本贴</button>
      <div className="rounded-2xl bg-[#FFF7E8] p-3">
        <h4 className="mb-2 flex items-center gap-2 font-black text-[#9B7D62]"><Sparkles className="h-4 w-4"/>贴纸盒（{boxEntries.filter(b=>b.unlocked).length}/{boxEntries.length}）</h4>
        <p className="mb-2 text-xs font-bold text-[#7A6958]">拖动已解锁贴纸到日记页即可贴入；灰色为未解锁版本，需在派对高分模式中获取。</p>
        {boxToast && <div className="mb-2 rounded-xl bg-[#FFE4A0] px-3 py-2 text-[11px] font-black text-[#594A3C]">{boxToast}</div>}
        <div className="diary-sticker-box grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {boxEntries.length===0 && <p className="col-span-2 text-center text-xs font-bold text-[#9B7D62]">暂无贴纸版本。</p>}
          {boxEntries.map(b=>{
            const variantLabel = (b.material==='普通'&&b.finish==='普通') ? '基础' : `${b.material==='普通'?'':b.material}${b.material!=='普通'&&b.finish!=='普通'?' · ':''}${b.finish==='普通'?'':b.finish}`;
            const key = `${b.id}-${b.material}-${b.finish}`;
            const { materialClass: decoMat, finishClass: decoFin } = b.unlocked
              ? getStickerVariantDecoClasses(b.material, b.finish)
              : { materialClass:'', finishClass:'' };
            if(!b.unlocked){
              return <button key={key} type="button" onClick={()=>{ setBoxToast(`「${b.name}」${variantLabel} 版本尚未解锁，前往派对高分模式挑战获取。`); setTimeout(()=>setBoxToast(''),2400); }} className="diary-sticker-item locked flex flex-col items-center gap-1 rounded-xl bg-white/40 p-2 cursor-not-allowed shadow-sm relative">
                <div className="diary-sticker-art opacity-30 grayscale"><img src={b.asset} alt={b.name} draggable={false}/></div>
                <Lock className="absolute right-1 top-1 h-3 w-3 text-[#9B7D62]"/>
                <span className="text-[10px] font-black text-[#9B7D62] truncate w-full text-center">{b.name}</span>
                <span className="text-[9px] font-bold text-[#9B7D62] truncate w-full text-center">{variantLabel}</span>
              </button>;
            }
            return <div key={key} draggable onDragStart={(e)=>{ e.dataTransfer.setData('application/diary-sticker',JSON.stringify({asset:b.asset,name:`${b.name}（${variantLabel}）`,id:b.id,material:b.material,finish:b.finish})); e.dataTransfer.effectAllowed='copy'; }} className="diary-sticker-item flex flex-col items-center gap-1 rounded-xl bg-white/70 p-2 cursor-grab active:cursor-grabbing hover:bg-white shadow-sm relative">
              <div className="diary-sticker-art relative" style={{ ['--sticker-mask' as any]: `url("${b.asset}")` } as React.CSSProperties}>
                <img src={b.asset} alt={b.name} draggable={false}/>
                {decoMat && <div className={decoMat}/>}
                {decoFin && <div className={decoFin}/>}
              </div>
              <span className="text-[10px] font-black text-[#594A3C] truncate w-full text-center">{b.name}</span>
              <span className="text-[9px] font-bold text-[#7A6958] truncate w-full text-center">{variantLabel}</span>
            </div>;
          })}
        </div>
      </div>
      <button onClick={()=>setCodexOpen(true)} className="w-full rounded-2xl bg-[#A7D8FF] py-3 font-black shadow flex items-center justify-center gap-2"><BookOpen className="h-4 w-4"/>所有收藏（贴纸图鉴）</button>
      <button onClick={()=>setBookOpen(true)} className="w-full rounded-2xl bg-[#FFE4A0] py-3 font-black shadow flex items-center justify-center gap-2"><BookOpen className="h-4 w-4"/>我的手账本{bookCount>0?`（${bookCount}）`:''}</button>
    </aside>
    {codexOpen && <StickerCodex unlocks={unlocks} onClose={()=>setCodexOpen(false)}/>}
    {bookOpen && <MyDiaryBook onClose={()=>{ setBookOpen(false); setBookCount(loadDiaryBook().length); }}/>}
  </section>;
}

// 入场特效展演区
type FxEvent = { id:string; material:MaterialKey; finish:FinishKey; asset:string; name:string; isUpgrade?:boolean; animationFrames?:string[] };

// 全屏贴入庆祝特效：覆盖整个视窗，约 750ms 自动消失，不阻塞交互
function FullscreenFx({event}:{event:FxEvent|null}){
  if(!event) return null;
  const matVis = MATERIALS[event.material].visual;
  const finVis = FINISHES[event.finish].visual;
  // 12 个粒子（外圈）+ 6 个 spark（内圈），按角度均匀分布
  const particles = Array.from({length:12},(_,i)=>{
    const angle = (i * 360) / 12;
    // 视窗对角线随机距离，模拟粒子飞向四周
    const dist = 240 + (i%3)*80; // 240/320/400 px
    return { angle, dist, key:`p-${event.id}-${i}` };
  });
  const sparks = Array.from({length:6},(_,i)=>{
    const angle = (i * 360) / 6 + 30;
    const dist = 180 + (i%2)*70;
    return { angle, dist, key:`s-${event.id}-${i}` };
  });
  const upgradeBursts = Array.from({length:10},(_,i)=>{
    const angle = (i * 360) / 10 + 18;
    const dist = 220 + (i%3)*55;
    return { angle, dist, key:`u-${event.id}-${i}` };
  });
  return <div className="fullscreen-fx" data-mat={matVis} data-fin={finVis} key={event.id} aria-hidden="true">
    <div className="fullfx-flash"/>
    {event.isUpgrade && <>
      <div className="fullfx-upgrade-aura"/>
      <div className="fullfx-upgrade-ring"/>
      <div className="fullfx-upgrade-ring-alt"/>
      <div className="fullfx-upgrade-crown"/>
      <div className="fullfx-upgrade-title">升级！</div>
      {upgradeBursts.map(item=>(
        <span key={item.key} className="fullfx-upgrade-burst"
          style={{['--angle' as any]: `${item.angle}deg`, ['--dist' as any]: `${item.dist}px`} as React.CSSProperties}/>
      ))}
    </>}
    {particles.map(p=>(
      <span key={p.key} className="fullfx-particle"
        style={{['--angle' as any]: `${p.angle}deg`, ['--dist' as any]: `${p.dist}px`} as React.CSSProperties}/>
    ))}
    {sparks.map(s=>(
      <span key={s.key} className="fullfx-spark"
        style={{['--angle' as any]: `${s.angle}deg`, ['--dist' as any]: `${s.dist}px`} as React.CSSProperties}/>
    ))}
    {event.animationFrames?.length ? <div className="fullfx-sticker-animation" aria-hidden="true">
      {event.animationFrames.map((frame,index)=><img key={`${event.id}-${frame}-${index}`} src={frame} alt="" className="fullfx-sticker-frame" style={{animationDelay:`-${(index/event.animationFrames.length)*1.1}s`}} draggable={false}/>) }
    </div> : <img src={event.asset} alt={event.name} className="fullfx-sticker"/>}
  </div>;
}

function normalizeCells(cells:number[][]):number[][]{
  const minR = Math.min(...cells.map(([r])=>r));
  const minC = Math.min(...cells.map(([,c])=>c));
  return cells
    .map(([r,c])=>[r-minR,c-minC])
    .sort(([ar,ac],[br,bc])=>ar-br || ac-bc);
}

function cellSetKey(cells:number[][]):string{
  return normalizeCells(cells).map(([r,c])=>`${r},${c}`).join('|');
}

function matchesPatternRequirement(item:any, requirement:VariantPatternRequirement):boolean{
  if(requirement.stickerIds?.length && !requirement.stickerIds.includes(item.id)) return false;
  if(requirement.types?.length && !requirement.types.includes(item.type)) return false;
  if(requirement.shapeKeys?.length && !requirement.shapeKeys.includes(item.shapeKey)) return false;
  return true;
}
function placedStickerCellSet(item:any):Set<string>{
  return new Set(item.cells.map(([dr,dc]:number[])=>`${item.row+dr},${item.col+dc}`));
}
function arePlacedStickersAdjacent(a:any,b:any):boolean{
  const aCells = placedStickerCellSet(a);
  return b.cells.some(([dr,dc]:number[])=>{
    const row = b.row + dr;
    const col = b.col + dc;
    return aCells.has(`${row+1},${col}`) || aCells.has(`${row-1},${col}`) || aCells.has(`${row},${col+1}`) || aCells.has(`${row},${col-1}`);
  });
}
function cloneVariantSticker(base:any, sticker:StickerDef, instanceId:string, inherited:any){
  return {
    ...base,
    ...sticker,
    kind:'sticker',
    instanceId,
    shape:SHAPES[sticker.shapeKey],
    rotation:0,
    material:inherited.material,
    finish:inherited.finish,
    inheritedFrom:inherited.id,
    isVariant:true,
    animationFrames:variantAnimationFrames(sticker.id),
  };
}
function variantAnimationFrames(stickerId:string):string[]|undefined{
  if(stickerId==='starry_star') return STAR_DYNAMIC_FRAMES;
  return undefined;
}
function createPartyWeather(layer:number):PartyWeatherState{
  const keys: PartyWeatherKey[] = ['晴朗','雨','雷'];
  return {
    key: keys[(layer - 1) % keys.length],
    level: Math.min(3, Math.max(1, Math.floor((layer - 1) / 2) + 1)) as PartyModifierLevel,
  };
}
function createPartyScene(layer:number):PartySceneState{
  const keys: PartySceneKey[] = ['动物园','游乐场','美食街'];
  return {
    key: keys[(layer - 1) % keys.length],
    level: Math.min(3, Math.max(1, Math.floor((layer - 1) / 3) + 1)) as PartyModifierLevel,
  };
}
function rollPartyWeather(seed:number):PartyWeatherKey{
  const keys: PartyWeatherKey[] = ['晴朗','雨','雷'];
  return keys[Math.abs(seed) % keys.length];
}
function rollPartyScene(seed:number):PartySceneKey{
  const keys: PartySceneKey[] = ['动物园','游乐场','美食街'];
  return keys[Math.abs(seed * 3 + 7) % keys.length];
}
function partyChoiceOptions(layer:number, weather:PartyWeatherState, scene:PartySceneState):PartyChoiceOption[]{
  const weatherKeys: PartyWeatherKey[] = ['晴朗','雨','雷'];
  const sceneKeys: PartySceneKey[] = ['动物园','游乐场','美食街'];
  const rewards = Array.from({length:3},(_,index)=>{
    const rewardType = ['coins','weather','scene'][Math.abs(layer * 23 + index * 17 + weather.level * 5 + scene.level * 7 + Date.now()) % 3] as 'coins'|'weather'|'scene';
    if(rewardType==='coins'){
      return { id:`party-choice-${layer}-${index}-coins`, title:'口袋补给', detail:'获得 3 枚硬币', coinReward:3 } satisfies PartyChoiceOption;
    }
    if(rewardType==='weather'){
      const weatherOffer = weatherKeys[Math.abs(layer * 29 + index * 13 + Date.now()) % weatherKeys.length];
      return { id:`party-choice-${layer}-${index}-weather-${weatherOffer}`, title:'天气补给', detail:weatherOffer===weather.key ? `升级天气（当前 ${weather.key} Lv.${weather.level}）` : `切换为 ${weatherOffer}（Lv.1）`, coinReward:0, weatherKey: weatherOffer } satisfies PartyChoiceOption;
    }
    const sceneOffer = sceneKeys[Math.abs(layer * 31 + index * 19 + Date.now()) % sceneKeys.length];
    return { id:`party-choice-${layer}-${index}-scene-${sceneOffer}`, title:'场景补给', detail:sceneOffer===scene.key ? `升级场景（当前 ${scene.key} Lv.${scene.level}）` : `切换为 ${sceneOffer}（Lv.1）`, coinReward:0, sceneKey: sceneOffer } satisfies PartyChoiceOption;
  });
  return rewards;
}
function getPartyChoiceVisual(choice:PartyChoiceOption):PartyChoiceVisual{
  if(choice.weatherKey){
    if(choice.weatherKey==='晴朗') return { badge:'天气补给', itemName:'晴朗', icon:<Sun className="h-8 w-8"/>, toneClass:'party-choice-card-weather-sun' };
    if(choice.weatherKey==='雨') return { badge:'天气补给', itemName:'雨', icon:<CloudRain className="h-8 w-8"/>, toneClass:'party-choice-card-weather-rain' };
    return { badge:'天气补给', itemName:'雷', icon:<Zap className="h-8 w-8"/>, toneClass:'party-choice-card-weather-thunder' };
  }
  if(choice.sceneKey){
    if(choice.sceneKey==='动物园') return { badge:'场景补给', itemName:'动物园', icon:<Trees className="h-8 w-8"/>, toneClass:'party-choice-card-scene-zoo' };
    if(choice.sceneKey==='美食街') return { badge:'场景补给', itemName:'美食街', icon:<UtensilsCrossed className="h-8 w-8"/>, toneClass:'party-choice-card-scene-food' };
    return { badge:'场景补给', itemName:'游乐场', icon:<PartyPopper className="h-8 w-8"/>, toneClass:'party-choice-card-scene-playground' };
  }
  return { badge:'口袋补给', itemName:`${choice.coinReward} 枚硬币`, icon:<Coins className="h-8 w-8"/>, toneClass:'party-choice-card-coins' };
}

export default function HappyStickerBookGame(){
  // 账号系统：在挂载时初始化默认账号 + 迁移旧 key；切换账号通过 reloadKey 强制重建状态
  const [account,setAccount] = useState<Account>(()=>initAccounts());
  const [reloadKey,setReloadKey] = useState<number>(0);
  return <HappyStickerBookGameInner
    key={`${account.id}-${reloadKey}`}
    account={account}
    onAccountChange={(next)=>{ setAccount(next); setReloadKey(k=>k+1); }}
  />;
}

function HappyStickerBookGameInner({account,onAccountChange}:{account:Account;onAccountChange:(a:Account)=>void}){
  const [mode,setMode]=useState<Mode>('home');
  const [levelIndex,setLevelIndex]=useState(0);

  // 派对模式：当前层数 (>=1) + 自动生成的关卡。levelIndex 在派对模式下不使用，使用 partyLayer 与 partyLevel 代替。
  const [partyLayer,setPartyLayer] = useState(1);
  const [partyLevel,setPartyLevel] = useState<PartyLevel>(()=>generatePartyLevel(1));
  const [partyWeather,setPartyWeather] = useState<PartyWeatherState>(()=>createPartyWeather(1));
  const [partyScene,setPartyScene] = useState<PartySceneState>(()=>createPartyScene(1));
  const [layerTransition,setLayerTransition] = useState<{show:boolean;layer:number}>({show:false,layer:1});
  const [failOpen,setFailOpen] = useState(false);
  const [dropToast,setDropToast] = useState<{id:string;name:string;material:string;finish:string;asset:string}|null>(null);
  const [partyChoiceOpen,setPartyChoiceOpen] = useState(false);
  const [partyChoices,setPartyChoices] = useState<PartyChoiceOption[]>([]);
  const [unlocks,setUnlocks] = useState<string[]>(()=>loadUnlocks());

  // mode==='party' 时使用 partyLevel；其它使用 L[levelIndex]
  const level: any = mode==='party' ? partyLevel : L[levelIndex];

  const [board,setBoard] = useState(()=>boardOf(level));
  const [placed,setPlaced] = useState<any[]>([]);
  const [candidates,setCandidates] = useState<any[]>(()=>[cand(level,1),cand(level,2),cand(level,3)]);
  const [selectedIndex,setSelectedIndex] = useState(0);
  const [baseScore,setBaseScore] = useState(0);
  const [patternScore,setPatternScore] = useState(1);
  const [specialScore,setSpecialScore] = useState(1);
  const [turn,setTurn] = useState(1);
  const [coins,setCoins] = useState(3);
  const [scoreCoinMilestone,setScoreCoinMilestone] = useState(0);
  const [orders,setOrders] = useState<any[]>(()=>level.orders.map(([kind,label,target]:any)=>({kind,label,target,progress:0})));
  const [message,setMessage] = useState('选择候选贴纸，点击或拖拽到棋盘中。');
  const [logs,setLogs] = useState<string[]>([]);
  const [progress,setProgress] = useState<any>(()=>load());
  const [resultOpen,setResultOpen] = useState(false);
  const [storyStarsEarned,setStoryStarsEarned] = useState(0);
  const [storyStarsDelta,setStoryStarsDelta] = useState(0);
  const [dragIndex,setDragIndex] = useState<number|null>(null);
  const [hoverCell,setHoverCell] = useState<{row:number;col:number}|null>(null);
  const boardRef = useRef<HTMLDivElement|null>(null);
  // 用 ref 存最新值，给原生 wheel/mousedown 监听器读取（避免闭包失效）
  const wheelStateRef = useRef<{mode:string; selectedIndex:number; hoverCell:{row:number;col:number}|null; candidatesLen:number}>({mode:'home', selectedIndex:0, hoverCell:null, candidatesLen:0});

  // 蓄积值（局内累计）
  const [fabricStack,setFabricStack] = useState(0); // 布料蓄积层
  const [dynamicTurn,setDynamicTurn] = useState({turn:0,fired:false}); // 动态贴纸：当前回合是否已首触
  const [lastChainPattern,setLastChainPattern] = useState(0); // 镭射追击参考

  const [fxEvent,setFxEvent] = useState<FxEvent|null>(null);
  const [floatLogs,setFloatLogs] = useState<{id:string;txt:string;kind:'base'|'pattern'|'special'}[]>([]);
  const [coinBurst,setCoinBurst] = useState<CoinBurst|null>(null);
  const [boardScorePopups,setBoardScorePopups] = useState<BoardScorePopup[]>([]);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [partySceneFrameIndex,setPartySceneFrameIndex] = useState(0);

  const selected = candidates[selectedIndex] || candidates[0];
  const total = baseScore * Math.max(1,patternScore) * Math.max(1,specialScore);
  const stars = Math.max(1,Math.min(3,Math.ceil(total/Math.max(1,level.star))));
  const storyStarProgress = mode==='story' ? Math.max(0, Math.min(1, total / Math.max(1, level.star * 3))) : 0;
  const collectedStoryStars = Math.max(0, Math.min(3, Number((progress.storyStars || {})[level?.key] || 0)));
  const isRainWeather = mode==='party' && partyWeather.key==='雨';
  const weatherCrateDisabled = isRainWeather;
  const weatherBubbleMultiplier = mode==='party' && partyWeather.key==='雨' && selected?.kind==='sticker' && selected.material==='泡泡贴'
    ? ([1, 1.5, 2, 3] as const)[partyWeather.level]
    : 1;
  const partyWeatherFrames = WEATHER_FRAMES[partyWeather.key];
  const partyWeatherDescription = PARTY_WEATHER_DESCRIPTIONS[partyWeather.key](partyWeather.level);
  const partySceneFrames = SCENE_FRAMES[partyScene.key];
  const partySceneDescription = PARTY_SCENE_DESCRIPTIONS[partyScene.key](partyScene.level);
  const playAudio = (src:string, volume=1)=>{
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(()=>undefined);
  };
  const playUiClick = ()=>playAudio(AUDIO_ASSETS.ui.click, 0.55);
  const playUiConfirm = ()=>playAudio(AUDIO_ASSETS.ui.confirm, 0.6);
  const playUiBack = ()=>playAudio(AUDIO_ASSETS.ui.back, 0.5);
  const playMaterialSound = (material:StickerMaterialKey)=>playAudio(AUDIO_ASSETS.material[material], 0.35);
  const playBaseScoreSound = ()=>playAudio(AUDIO_ASSETS.score.base, 0.4);

  useEffect(()=>{
    const src = mode==='home' ? AUDIO_ASSETS.bgm.home
      : mode==='storyMenu' || mode==='story' ? AUDIO_ASSETS.bgm.story
      : mode==='party' ? AUDIO_ASSETS.bgm.party
      : mode==='diary' ? AUDIO_ASSETS.bgm.diary
      : mode==='shop' ? AUDIO_ASSETS.bgm.shop
      : null;
    if(!src) return;
    if(bgmRef.current){
      bgmRef.current.pause();
      bgmRef.current = null;
    }
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.34;
    bgmRef.current = audio;
    void audio.play().catch(()=>undefined);
    return ()=>{
      audio.pause();
      if(bgmRef.current===audio) bgmRef.current = null;
    };
  },[mode]);

  useEffect(()=>{
    setPartySceneFrameIndex(0);
  },[partyScene.key]);

  useEffect(()=>{
    if(mode!=='party') return;
    if(!partySceneFrames.length) return;
    const timer = window.setInterval(()=>{
      setPartySceneFrameIndex(cur=>(cur + 1) % partySceneFrames.length);
    }, 66);
    return ()=>window.clearInterval(timer);
  },[mode, partySceneFrames]);

  useEffect(()=>acctSetItem(KEY,JSON.stringify(progress)),[progress]);
  useEffect(()=>saveUnlocks(unlocks),[unlocks]);

  // 全屏贴入特效：约 750ms 后自动卸载，避免粒子残留与遮挡交互
  useEffect(()=>{
    if(!fxEvent) return;
    const t = setTimeout(()=>setFxEvent(null), 780);
    return ()=>clearTimeout(t);
  },[fxEvent]);

  // 掉落 toast 自动关闭
  useEffect(()=>{
    if(!dropToast) return;
    const t = setTimeout(()=>setDropToast(null), 1200);
    return ()=>clearTimeout(t);
  },[dropToast]);

  useEffect(()=>{
    if(!coinBurst) return;
    const t = setTimeout(()=>setCoinBurst(null), 880);
    return ()=>clearTimeout(t);
  },[coinBurst]);

  // 全局键盘控制：
  //  ←/A 逆时针、→/D 顺时针旋转当前选中贴纸；
  //  ↑/W 上一个候选、↓/S 下一个候选（循环）。
  // 输入框 / textarea 聚焦时跳过，避免干扰打字。
  useEffect(()=>{
    const handler = (e: KeyboardEvent)=>{
      const target = e.target as HTMLElement | null;
      if(target){
        const tag = target.tagName;
        if(tag==='INPUT' || tag==='TEXTAREA' || target.isContentEditable) return;
      }
      if(mode!=='story' && mode!=='party') return;
      if(!candidates.length) return;
      const k = e.key;

      // 切换候选
      if(k==='ArrowUp' || k==='w' || k==='W' || k==='ArrowDown' || k==='s' || k==='S'){
        e.preventDefault();
        const dir = (k==='ArrowDown' || k==='s' || k==='S') ? 1 : -1;
        const len = candidates.length;
        // 当前没选中（越界）时，按任意方向键默认选第 0 个
        const cur = (selectedIndex>=0 && selectedIndex<len) ? selectedIndex : -1;
        const next = cur<0 ? 0 : ((cur + dir) % len + len) % len;
        setSelectedIndex(next);
        return;
      }

      // 旋转：仅对 sticker 候选生效
      const sel = candidates[selectedIndex];
      if(!sel || sel.kind!=='sticker') return;
      let dir = 0;
      if(k==='ArrowRight' || k==='d' || k==='D') dir = 1;
      else if(k==='ArrowLeft' || k==='a' || k==='A') dir = -1;
      else return;
      e.preventDefault();
      setCandidates(cur=>cur.map((x,i)=>{
        if(i!==selectedIndex || x.kind!=='sticker') return x;
        const nr = ((x.rotation + dir*90) % 360 + 360) % 360;
        return { ...x, rotation: nr };
      }));
    };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  },[mode, candidates, selectedIndex]);

  // 同步最新状态给原生 wheel / mousedown 监听器
  useEffect(()=>{
    wheelStateRef.current = { mode, selectedIndex, hoverCell, candidatesLen: candidates.length };
  },[mode, selectedIndex, hoverCell, candidates.length]);

  // 棋盘鼠标交互：滚轮旋转贴纸 / 中键切换候选（仅 story / party 且 hover 在棋盘格上时）
  useEffect(()=>{
    const el = boardRef.current;
    if(!el) return;
    if(mode!=='story' && mode!=='party') return;

    const onWheel = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if(st.mode!=='story' && st.mode!=='party') return;
      if(!st.hoverCell) return;
      if(st.candidatesLen<=0) return;
      const sel = candidates[st.selectedIndex];
      if(!sel || sel.kind!=='sticker') return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1; // 下滚顺时针
      setCandidates(cur=>cur.map((x,i)=>{
        if(i!==st.selectedIndex || x.kind!=='sticker') return x;
        const nr = ((x.rotation + dir*90) % 360 + 360) % 360;
        return { ...x, rotation: nr };
      }));
    };

    const onMouseDown = (e: MouseEvent) => {
      const st = wheelStateRef.current;
      if(st.mode!=='story' && st.mode!=='party') return;
      if(!st.hoverCell) return;
      if(st.candidatesLen<=0) return;
      if(e.button !== 1) return; // 仅中键
      e.preventDefault();
      const len = st.candidatesLen;
      const next = ((st.selectedIndex + 1) % len + len) % len;
      // 切换后将新选中贴纸 rotation 重置为 0
      setCandidates(cur=>cur.map((x,i)=> (i===next && x.kind==='sticker') ? { ...x, rotation: 0 } : x));
      setSelectedIndex(next);
    };

    const onAuxClick = (e: MouseEvent) => {
      // 防止某些浏览器中键 click 触发默认（自动滚动模式 / 新标签等）
      if(e.button === 1) e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('auxclick', onAuxClick);
    return ()=>{
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('auxclick', onAuxClick);
    };
  },[mode, candidates]);

  // 设置一关：剧情模式按 idx 取 L；派对模式按 partyLayer 取 partyLevel
  const setupLevel = (n:any, isParty:boolean, layerNum?:number, options?:{ keepCoins?: boolean })=>{
    setBoard(boardOf(n));
    setPlaced([]);
    const seedBase = isParty ? (layerNum||1)*7 : ((typeof n.key==='string'?n.key.length:0)*10);
    setCandidates([cand(n,seedBase+1),cand(n,seedBase+2),cand(n,seedBase+3)]);
    setSelectedIndex(0);
    setBaseScore(0); setPatternScore(1); setSpecialScore(1);
    setTurn(1); if(!options?.keepCoins) setCoins(3); setScoreCoinMilestone(0);
    setOrders(n.orders.map(([kind,label,target]:any)=>({kind,label,target,progress:0})));
    setLogs([]);
    setMessage(isParty?`第 ${layerNum} 层：${n.goal}`:`${n.key} ${n.name}：${n.goal}`);
    setResultOpen(false); setDragIndex(null); setHoverCell(null);
    setFabricStack(0); setDynamicTurn({turn:0,fired:false}); setLastChainPattern(0);
    setFxEvent(null); setFloatLogs([]); setCoinBurst(null);
    setPartyChoiceOpen(false); setPartyChoices([]);
    setStoryStarsEarned(0); setStoryStarsDelta(0);
  };

  const buyShopItem = (itemId:string)=>{
    const item = SHOP_ITEMS.find(entry=>entry.id===itemId);
    if(!item) return;
    setProgress((cur:any)=>{
      const purchases = cur.shopPurchases || [];
      if(purchases.includes(item.id)){
        setMessage(`${item.name} 已购买。`);
        playUiClick();
        return cur;
      }
      const balance = Number(cur.starBalance || 0);
      if(balance < item.price){
        setMessage(`星星不足，购买 ${item.name} 需要 ${item.price} 颗星星。`);
        playUiClick();
        return cur;
      }
      setMessage(`已购买 ${item.name}，后续可在这里扩充更多关外内容。`);
      playUiConfirm();
      return {
        ...cur,
        starBalance: balance - item.price,
        shopPurchases: [...purchases, item.id],
      };
    });
  };

  const reset = (idx=levelIndex,nextMode=mode)=>{
    if(nextMode==='party'){
      const layerNum = 1;
      const pl = generatePartyLevel(layerNum);
      const nextWeather = { key: rollPartyWeather(Date.now()), level: 1 as PartyModifierLevel };
      const nextScene = { key: rollPartyScene(Date.now()), level: 1 as PartyModifierLevel };
      setPartyLayer(layerNum);
      setPartyLevel(pl);
      setPartyWeather(nextWeather);
      setPartyScene(nextScene);
      setupLevel(pl, true, layerNum);
      return;
    }
    const n = L[idx];
    setLevelIndex(idx);
    setupLevel(n, false);
  };

  // 派对模式：进入下一层
  const advancePartyLayer = ()=>{
    const next = partyLayer + 1;
    setPartyChoices(partyChoiceOptions(next, partyWeather, partyScene));
    setPartyChoiceOpen(true);
  };
  const choosePartyReward = (choice:PartyChoiceOption)=>{
    const next = partyLayer + 1;
    if(choice.coinReward>0){
      setCoins(v=>v + choice.coinReward);
      setCoinBurst({ id:`party-choice-${Date.now()}`, source:'party-choice', amount:choice.coinReward, label:`+${choice.coinReward} 硬币` });
    }
    if(choice.weatherKey){
      setPartyWeather(cur=>choice.weatherKey===cur.key ? { ...cur, level: Math.min(3, cur.level + 1) as PartyModifierLevel } : { key: choice.weatherKey!, level: 1 });
    }
    if(choice.sceneKey){
      setPartyScene(cur=>choice.sceneKey===cur.key ? { ...cur, level: Math.min(3, cur.level + 1) as PartyModifierLevel } : { key: choice.sceneKey!, level: 1 });
    }
    setPartyChoiceOpen(false);
    setLayerTransition({show:true,layer:next});
    setTimeout(()=>{
      const pl = generatePartyLevel(next);
      setPartyLayer(next);
      setPartyLevel(pl);
      setupLevel(pl, true, next, { keepCoins:true });
      setLayerTransition({show:false,layer:next});
    }, 720);
  };

  // 派对模式：失败处理 - 弹出确认对话框
  const partyFail = ()=>{ setFailOpen(true); };
  // 失败后：从第一层重新开始
  const partyRestart = ()=>{
    setFailOpen(false);
    reseedPartySession();
    const pl = generatePartyLevel(1);
    const nextWeather = { key: rollPartyWeather(Date.now()+1), level: 1 as PartyModifierLevel };
    const nextScene = { key: rollPartyScene(Date.now()+1), level: 1 as PartyModifierLevel };
    setPartyLayer(1);
    setPartyLevel(pl);
    setPartyWeather(nextWeather);
    setPartyScene(nextScene);
    setupLevel(pl, true, 1);
  };
  // 失败后：回到主界面
  const partyExit = ()=>{ playUiBack(); setFailOpen(false); setMode('home'); };

  const enter = (m:Mode)=>{
    // 剧情模式入口：先进入关卡目录页，玩家自行选择关卡
    if(m==='story'){ playUiConfirm(); setMode('storyMenu'); return; }
    playUiConfirm();
    setMode(m);
    if(m==='party'){
      reseedPartySession();
      const pl = generatePartyLevel(1);
      const nextWeather = { key: rollPartyWeather(Date.now()+2), level: 1 as PartyModifierLevel };
      const nextScene = { key: rollPartyScene(Date.now()+2), level: 1 as PartyModifierLevel };
      setPartyLayer(1);
      setPartyLevel(pl);
      setPartyWeather(nextWeather);
      setPartyScene(nextScene);
      setupLevel(pl, true, 1);
    }
  };
  // 从剧情目录页选择某关进入游玩
  const enterStoryLevel = (idx:number)=>{
    playUiConfirm();
    setMode('story');
    reset(idx,'story');
  };
  const updateOrder = (kind:string,amt:number,score=total)=>setOrders(cur=>cur.map(o=>o.kind==='score'?{...o,progress:Math.min(o.target,score)}:o.kind===kind?{...o,progress:Math.min(o.target,o.progress+amt)}:o));

  const canTool = (tool:any,r:number,c:number)=>{
    const cell = board[r]?.[c]; if(!cell) return false;
    if(tool.id==='sponge') return !!(cell.stickerId && !cell.sponge && !cell.stackId && cell.terrain!=='crate' && cell.terrain!=='masked');
    if(tool.id==='eraser') return cell.terrain==='stain';
    if(tool.id==='scissors') return cell.terrain==='crate' && !weatherCrateDisabled;
    return false;
  };
  const canSticker = (i:number,r:number,c:number)=>{
    const x = candidates[i]; if(!x||x.kind!=='sticker') return false;
    return rotShape(x.shape,x.rotation).every(([dr,dc])=>{
      const cell = board[r+dr]?.[c+dc];
      return !!cell && cell.terrain!=='masked' && (cell.terrain!=='crate' || weatherCrateDisabled) && (!cell.stickerId||(cell.sponge && !cell.stackId));
    });
  };
  const can = (i:number,r:number,c:number)=>candidates[i]?.kind==='tool'?canTool(candidates[i],r,c):canSticker(i,r,c);

  const adj = (cells:number[][],r:number,c:number,type:string)=>{
    const own = new Set(cells.map(([dr,dc])=>`${r+dr},${c+dc}`));
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const nei = new Set<string>();
    let same = 0;
    cells.forEach(([dr,dc])=>dirs.forEach(([ar,ac])=>{
      const key = `${r+dr+ar},${c+dc+ac}`;
      if(own.has(key)) return;
      const hit = placed.find(it=>it.cells.some(([ir,ic]:number[])=>`${it.row+ir},${it.col+ic}`===key));
      if(hit){ nei.add(hit.instanceId); if(hit.type===type) same++; }
    }));
    return { count: nei.size, same };
  };

  const resolveUpgrade = (trigger:any, nextBoard:any[][], nextPlaced:any[])=>{
    const triggerRules = VARIANT_UPGRADE_RULES.filter(rule=>{
      const idOk = !rule.triggerStickerIds?.length || rule.triggerStickerIds.includes(trigger.id);
      const shapeOk = !rule.triggerShapeKeys?.length || rule.triggerShapeKeys.includes(trigger.shapeKey);
      const typeOk = !rule.triggerTypes?.length || rule.triggerTypes.includes(trigger.type);
      return idOk && shapeOk && typeOk;
    });
    if(!triggerRules.length) return null;

    for(const rule of triggerRules){
      if(rule.mode==='adjacent'){
        if(trigger.isVariant) continue;
        const neighbors = nextPlaced.filter(item=>item.instanceId!==trigger.instanceId && !item.isVariant && arePlacedStickersAdjacent(trigger, item));
        for(const neighbor of neighbors){
          const triggerPair = rule.adjacency.pairings.find(pair=>pair.fromId===trigger.id);
          const neighborPair = rule.adjacency.pairings.find(pair=>pair.fromId===neighbor.id);
          if(!triggerPair || !neighborPair) continue;
          const triggerSticker = S.find(item=>item.id===triggerPair.toId);
          const neighborSticker = S.find(item=>item.id===neighborPair.toId);
          if(!triggerSticker || !neighborSticker) continue;
          if(triggerSticker.shapeKey!==trigger.shapeKey || neighborSticker.shapeKey!==neighbor.shapeKey) continue;
          const inheritedTrigger = Math.random()<0.5 ? trigger : neighbor;
          const inheritedNeighbor = Math.random()<0.5 ? trigger : neighbor;
          const finalBoard = nextBoard.map(line=>line.map(cell=>({...cell})));
          const finalPlaced = nextPlaced.filter(item=>item.instanceId!==trigger.instanceId && item.instanceId!==neighbor.instanceId);
          const upgradedTrigger = cloneVariantSticker(trigger, triggerSticker, `upgrade-${rule.id}-trigger-${Date.now()}-${Math.floor(Math.random()*9999)}`, inheritedTrigger);
          const upgradedNeighbor = cloneVariantSticker(neighbor, neighborSticker, `upgrade-${rule.id}-neighbor-${Date.now()}-${Math.floor(Math.random()*9999)}`, inheritedNeighbor);
          trigger.cells.forEach(([dr,dc]:number[])=>{
            const cell = finalBoard[trigger.row+dr]?.[trigger.col+dc];
            if(!cell) return;
            cell.stickerId = upgradedTrigger.instanceId;
            cell.stackId = null;
            cell.sponge = false;
          });
          neighbor.cells.forEach(([dr,dc]:number[])=>{
            const cell = finalBoard[neighbor.row+dr]?.[neighbor.col+dc];
            if(!cell) return;
            cell.stickerId = upgradedNeighbor.instanceId;
            cell.stackId = null;
            cell.sponge = false;
          });
          finalPlaced.push(upgradedNeighbor, upgradedTrigger);
          return {
            rule,
            sticker:upgradedTrigger,
            board:finalBoard,
            placed:finalPlaced,
            inherited:inheritedTrigger,
            cells:upgradedTrigger.cells,
            row:upgradedTrigger.row,
            col:upgradedTrigger.col,
            extraUpgraded:[upgradedNeighbor],
            scoreStickerIds:[upgradedTrigger.id, upgradedNeighbor.id],
          };
        }
        continue;
      }
      const targetShape = SHAPES[rule.pattern.targetShapeKey];
      if(!targetShape) continue;
      const resultSticker = S.find(item=>item.id===rule.resultId);
      if(!resultSticker) continue;
      const triggerCellsAbs = trigger.cells.map(([dr,dc]:number[])=>[trigger.row+dr, trigger.col+dc]);
      const seedCandidates = nextPlaced.filter(item=>item.instanceId!==trigger.instanceId && item.cells.some(([dr,dc]:number[])=>{
        return triggerCellsAbs.some(([tr,tc])=>{
          const d = Math.abs(tr-(item.row+dr)) + Math.abs(tc-(item.col+dc));
          return d===1;
        });
      }));
      const participantPool = [trigger, ...seedCandidates];
      const requiredCount = rule.pattern.requirements.reduce((sum, req)=>sum+req.count, 0);
      const combos:number[][] = [];
      const dfs = (start:number, picks:number[])=>{
        if(picks.length===requiredCount){ combos.push([...picks]); return; }
        for(let idx=start; idx<participantPool.length; idx++) dfs(idx+1, [...picks, idx]);
      };
      dfs(1, [0]);

      for(const pick of combos){
        const selected = pick.map(index=>participantPool[index]);
        const unionCells = Array.from(new Set(selected.flatMap(item=>item.cells.map(([dr,dc]:number[])=>`${item.row+dr},${item.col+dc}`)))).map(key=>key.split(',').map(Number) as number[]);
        if(unionCells.length !== targetShape.length) continue;
        if(cellSetKey(unionCells) !== cellSetKey(targetShape)) continue;

        const countsOk = rule.pattern.requirements.every(requirement=>selected.filter(item=>matchesPatternRequirement(item, requirement)).length===requirement.count);
        if(!countsOk) continue;

        const inherited = selected[Math.floor(Math.random()*selected.length)] || trigger;
        const minRow = Math.min(...unionCells.map(([row])=>row));
        const minCol = Math.min(...unionCells.map(([,col])=>col));
        const upgradedCells = normalizeCells(unionCells);
        const upgradedSet = new Set(selected.map(item=>item.instanceId));
        const finalPlaced = nextPlaced.filter(item=>!upgradedSet.has(item.instanceId));
        const finalBoard = nextBoard.map(line=>line.map(cell=>({...cell})));
        const instanceId = `upgrade-${rule.id}-${Date.now()}-${Math.floor(Math.random()*9999)}`;
        unionCells.forEach(([row,col])=>{
          const cell = finalBoard[row]?.[col];
          if(!cell) return;
          cell.stickerId = instanceId;
          cell.stackId = null;
          cell.sponge = false;
        });
        const upgradedSticker = {
          ...cloneVariantSticker({ row:minRow, col:minCol, cells:upgradedCells, stacked:false }, resultSticker, instanceId, inherited),
          upgradeRuleId:rule.id,
          sourceStickerIds:selected.map(item=>item.id),
        };
        finalPlaced.push(upgradedSticker);
        return { rule, sticker:upgradedSticker, board:finalBoard, placed:finalPlaced, inherited, cells:upgradedCells, row:minRow, col:minCol, scoreStickerIds:[upgradedSticker.id] };
      }
    }
    return null;
  };

  const maybe = (score:number)=>{
    if(mode==='party'){
      if(score>=level.targetScore){
        // 解锁掉落
        const drop = rollDrop(unlocks, partyLayer, ALL_STICKER_IDS);
        if(drop){
          // 区分"新解锁"(图鉴里这一组合此前没拥有) vs "已拥有"(重复掉落)
          const isNew = !unlocks.includes(drop.key);
          setUnlocks(cur=>Array.from(new Set([...cur, drop.key])));
          const sticker = S.find(s=>s.id===drop.id);
          if(sticker){
            // 派对模式 · 仅用横向弹幕通知，去掉右侧 dropToast 弹框
            emitBullet({
              icon: sticker.asset,
              name: sticker.name,
              variant: `${drop.material} / ${drop.finish}`,
              kind: isNew ? 'new' : 'dup',
            });
          }
        }
        setProgress((cur:any)=>({...cur,bestScore:Math.max(cur.bestScore,score)}));
        advancePartyLayer();
      }
      return;
    }
    const allOrdersDone = orders.every(o=>o.progress>=o.target);
    if(mode==='story' && allOrdersDone){
      const earnedStars = Math.max(1, Math.min(3, Math.ceil(score / Math.max(1, level.star))));
      const prevStars = Math.max(0, Math.min(3, Number((progress.storyStars || {})[level.key] || 0)));
      const starsDelta = Math.max(0, earnedStars - prevStars);
      setResultOpen(true);
      setStoryStarsEarned(earnedStars);
      setStoryStarsDelta(starsDelta);
      setProgress((cur:any)=>{
        return {
          ...cur,
          bestScore: Math.max(cur.bestScore, score),
          highestLevel: Math.max(cur.highestLevel, Math.min(levelIndex + 1, L.length - 1)),
          cleared: Array.from(new Set([...cur.cleared, level.key])),
          storyStars: { ...(cur.storyStars || {}), [level.key]: Math.max(Math.max(0, Math.min(3, Number((cur.storyStars || {})[level.key] || 0))), earnedStars) },
          starBalance: Number(cur.starBalance || 0) + starsDelta,
        };
      });
      return;
    }
    if(mode==='story' && placed.length>22){
      setMessage('订单尚未全部完成，剧情手账不会按分数直接通关。');
    }
  };

  // 派对模式失败检测：每次贴入后若已贴满且未达到目标总分，则视为失败
  const checkPartyFail = ()=>{
    if(mode!=='party') return;
    if(total >= level.targetScore || partyChoiceOpen) return;
    if(placed.length >= 26){
      setTimeout(()=>partyFail(), 100);
    }
  };
  const refreshOne = (i:number)=>{ setCandidates(cur=>cur.map((x,k)=>k===i?cand(level,turn*19+k+levelIndex*5):x)); setSelectedIndex(0); };

  const pushFloat = (txt:string, kind:'base'|'pattern'|'special')=>{
    const id = `f-${Date.now()}-${Math.random().toFixed(3)}`;
    setFloatLogs(cur=>[...cur,{id,txt,kind}]);
    setTimeout(()=>setFloatLogs(cur=>cur.filter(f=>f.id!==id)),2200);
  };
  const pushBoardScorePopups = (cells:[number,number][], totalValue:number, kind:'base'|'pattern'|'special', label?:string, stackIndex = 0)=>{
    if(totalValue<=0 || cells.length===0) return;
    const base = Math.floor(totalValue / cells.length);
    const rem = totalValue % cells.length;
    const popups = cells.map(([row,col],index)=>({
      id:`bsp-${kind}-${Date.now()}-${index}-${Math.random().toFixed(3)}`,
      row,
      col,
      value: base + (index < rem ? 1 : 0),
      kind,
      label,
      stackIndex,
      dx: ((index % 2 === 0 ? -1 : 1) * (6 + (index % 3) * 3)) + ((row + col) % 3 - 1) * 2,
      dy: -10 - stackIndex * 22 - (index % 3) * 6,
      delay: stackIndex * 90 + index * 35,
    })).filter(item=>item.value>0);
    if(popups.length===0) return;
    setBoardScorePopups(cur=>[...cur,...popups]);
    setTimeout(()=>{
      const ids = new Set(popups.map(item=>item.id));
      setBoardScorePopups(cur=>cur.filter(item=>!ids.has(item.id)));
    }, 1600);
  };

  const applyTool = (i:number,r:number,c:number)=>{
    const x = candidates[i];
    if(!canTool(x,r,c)){ setMessage('这个道具不能用在这里，请看绿色可用提示。'); return; }
    playUiConfirm();
    const n = board.map(line=>line.map(cell=>({...cell})));
    const cell = n[r][c];
    if(x.id==='sponge'){ cell.sponge = true; updateOrder('sponge',1); setMessage('海绵胶已贴好：这个格子可以继续叠贴。'); }
    if(x.id==='eraser'){ cell.terrain = 'normal'; updateOrder('stain',1); setMessage('污渍已擦除，格子恢复普通。'); }
    if(x.id==='scissors'){ cell.terrain = 'normal'; updateOrder('crate',1); setMessage('纸箱已剪开，可用空间增加。'); }
    setBoard(n);
    setTurn(v=>v+1);
    setLogs(cur=>[`${x.name} 生效`,...cur].slice(0,8));
    refreshOne(i);
    setTimeout(()=>maybe(total),80);
  };

  // 计算材质能力得分
  const computeMaterial = (m:MaterialKey, ctx:{B:number;C:number;N:number;O:number;F:number;hi:number;stainAdj:number;chainPattern:number;orderProgressed:number;orderCompleted:number;stableHits:number;}):{score:number;detail:string}=>{
    const cap = MATERIALS[m].cap;
    switch(m){
      case '镭射': {
        if(ctx.C>=1){
          const s = Math.min(2*ctx.C, cap);
          return { score: s, detail: `镭射追击 +${s}（基于上一次构型）` };
        }
        return { score:0, detail:'' };
      }
      case '布料': {
        // 兑现时由外部触发：若达到 3 层，本次 score = 5 (2+3)；否则 +1 蓄积
        return { score:0, detail:'' }; // 由 place() 内根据 fabricStack 计算
      }
      case '磨砂': {
        const s = Math.min(2*ctx.stableHits + ctx.stainAdj, cap);
        if(s===0) return { score:0, detail:'' };
        return { score:s, detail:`磨砂消噪 +${s}（稳态 ${ctx.stableHits}，污渍邻 ${ctx.stainAdj}）` };
      }
      case '水晶贴': {
        if(ctx.B>=3){
          const s = Math.min(Math.floor(ctx.B/2) + ctx.hi, cap);
          return { score:s, detail:`水晶聚光 +${s}（B=${ctx.B}，奖励 ${ctx.hi}）` };
        }
        return { score:0, detail:'' };
      }
      case '泡泡贴': {
        let s = ctx.N + (ctx.N>=3?2:0);
        s = Math.min(s, cap);
        if(s===0) return { score:0, detail:'' };
        return { score:s, detail:`泡泡弹跳 +${s}（邻 ${ctx.N}${ctx.N>=3?' 群聚':''}）` };
      }
      case '烫金': {
        const s = Math.min(2*ctx.orderProgressed + (ctx.orderCompleted?2:0), cap);
        if(s===0) return { score:0, detail:'' };
        return { score:s, detail:`烫金点题 +${s}${ctx.orderCompleted?'（完成奖励）':''}` };
      }
      default: return { score:0, detail:'' };
    }
  };

  const computeFinish = (f:FinishKey, ctx:{B:number;C:number;N:number;hi:number;F:number;dynamicFirst:boolean}):{score:number;detail:string}=>{
    const cap = FINISHES[f].cap;
    switch(f){
      case '金色闪粉': {
        if(ctx.B>=4 || ctx.C>=2){
          const s = Math.min(3 + ctx.hi, cap);
          return { score:s, detail:`金色闪粉高光 +${s}` };
        }
        return { score:0, detail:'' };
      }
      case '彩色闪粉': {
        let s = ctx.N + (ctx.N>=3?1:0);
        s = Math.min(s, cap);
        if(s===0) return { score:0, detail:'' };
        return { score:s, detail:`彩色闪粉彩屑 +${s}` };
      }
      case '动态贴纸': {
        const s = ctx.dynamicFirst ? 2 : 1;
        return { score:Math.min(s,cap), detail:`动态贴纸节奏 +${s}` };
      }
      case '荧光贴纸': {
        const s = Math.min(2*ctx.F, cap);
        if(s===0) return { score:0, detail:'' };
        return { score:s, detail:`荧光揭示 ×${ctx.F} +${s}` };
      }
      default: return { score:0, detail:'' };
    }
  };

  const place = (i:number,r:number,c:number)=>{
    const x = candidates[i]; if(!x) return;
    if(x.kind==='tool'){ applyTool(i,r,c); return; }
    if(!canSticker(i,r,c)){ setMessage('这里贴不下哦，红色提示表示不可放置。'); return; }
    playUiConfirm();

    const cells = rotShape(x.shape,x.rotation);
    const n = board.map(line=>line.map(cell=>({...cell})));
    let bg = 0, hi = 0, stack = false, fogReveal = 0, stableHits = 0, stainAdj = 0;
    const detailLines:string[] = [];
    const specialPopupEntries:{ value:number; label:string }[] = [];

    // 邻位污渍计数
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    cells.forEach(([dr,dc])=>{
      dirs.forEach(([ar,ac])=>{
        const cell = n[r+dr+ar]?.[c+dc+ac];
        if(cell && cell.terrain==='stain') stainAdj++;
      });
    });

    cells.forEach(([dr,dc])=>{
      const cell = n[r+dr][c+dc];
      const isStack = !!(cell.stickerId && cell.sponge && !cell.stackId);
      stack = stack || isStack;
      bg += Math.max(0, cell.base - (isStack?1:0));
      if(cell.base>=3 || cell.terrain==='reward') hi++;
      // 磨砂稳态命中：基础≤1 或 海绵胶减益
      if(cell.base<=1 || isStack) stableHits++;
      // 荧光揭示
      if(cell.terrain==='fog' && x.finish==='荧光贴纸'){
        cell.terrain = 'reward';
        cell.base = Math.min(3, cell.base+1);
      }
      if(isStack) cell.stackId = x.instanceId; else cell.stickerId = x.instanceId;
    });

    if(mode==='party'){
      const sceneBonus = partyScene.level===1 ? 1 : partyScene.level===2 ? 3 : 5;
      const sceneMatch = (partyScene.key==='游乐场' && x.type==='节日')
        || (partyScene.key==='美食街' && x.type==='食物')
        || (partyScene.key==='动物园' && x.type==='动物');
      if(sceneMatch){
        bg += sceneBonus;
        detailLines.push(`${partyScene.key}基础加成 +${sceneBonus}`);
        specialPopupEntries.push({ value:sceneBonus, label:partyScene.key });
      }
    }

    // 荧光贴纸：邻接 4 向揭示
    let F = 0;
    if(x.finish==='荧光贴纸'){
      cells.forEach(([dr,dc])=>{
        dirs.forEach(([ar,ac])=>{
          const cell = n[r+dr+ar]?.[c+dc+ac];
          if(cell && cell.terrain==='fog'){
            cell.terrain = 'reward';
            cell.base = Math.min(3, cell.base+1);
            F++;
          }
        });
      });
      fogReveal = F;
    }

    const placedTrigger = {...x,row:r,col:c,cells,stacked:stack};
    let placedAfter = [...placed, placedTrigger];
    const upgrade = resolveUpgrade(placedTrigger, n, placedAfter);
    const activeSticker = upgrade ? upgrade.sticker : placedTrigger;
    const activeCells = upgrade ? upgrade.cells : cells;
    const activeRow = upgrade ? upgrade.row : r;
    const activeCol = upgrade ? upgrade.col : c;
    if(upgrade){
      placedAfter = upgrade.placed;
    }
    const activeAdj = adj(activeCells,activeRow,activeCol,activeSticker.type);
    const pg = activeAdj.count + activeAdj.same + (activeCells.length>=4?1:0);
    const scoreStickerIds = upgrade?.scoreStickerIds || [activeSticker.id];
    const extraUpgraded = upgrade?.extraUpgraded || [];
    const effectiveUpgradeCount = upgrade ? Math.max(1, scoreStickerIds.length) : 0;

    // 动态贴纸首触判定
    const dynamicFirst = activeSticker.finish==='动态贴纸' && (dynamicTurn.turn!==turn || !dynamicTurn.fired);

    // 订单推进计数（用于烫金）
    const orderTargetsBefore = orders.map(o=>o.progress);
    let orderProgressed = 0, orderCompleted = 0;
    // 我们粗略用：本次会推进的订单数
    const willProgress = [
      'place',
      activeSticker.type==='食物'?'food':null,
      activeAdj.count>0?'adjacent':null,
      activeSticker.material!=='普通'?'material':null,
      activeSticker.finish!=='普通'?'finish':null,
      hi>0?'high':null,
      stack?'stack':null,
      effectiveUpgradeCount>0 || activeAdj.same>=2?'upgrade':null,
    ].filter(Boolean) as string[];
    orders.forEach(o=>{
      if(willProgress.includes(o.kind) && o.progress<o.target){
        orderProgressed++;
        const after = Math.min(o.target, o.progress + (o.kind==='adjacent'?activeAdj.count:1));
        if(after>=o.target && o.progress<o.target) orderCompleted++;
      }
    });

    // 计算材质分
    let sg = 0;

    // 布料：每贴 +1 蓄积；满 3 层兑现 +5
    let nextFabricStack = fabricStack;
    if(activeSticker.material==='布料'){
      nextFabricStack = fabricStack + 1;
      if(nextFabricStack>=3){
        sg += 5;
        detailLines.push(`布料兑现 +5（蓄积 3/3）`);
        specialPopupEntries.push({ value:5, label:'布料' });
        nextFabricStack = 0;
      } else {
        detailLines.push(`布料蓄积 ${nextFabricStack}/3`);
      }
    }

    const matRes = computeMaterial(activeSticker.material as MaterialKey, {
      B: bg, C: lastChainPattern, N: activeAdj.count, O: orderProgressed, F: fogReveal,
      hi, stainAdj, chainPattern: lastChainPattern, orderProgressed, orderCompleted,
      stableHits,
    });
    if(matRes.score>0){
      sg += matRes.score;
      detailLines.push(matRes.detail);
      specialPopupEntries.push({ value:matRes.score, label:MATERIALS[activeSticker.material as MaterialKey].label });
    }

    // 外观
    const finRes = computeFinish(activeSticker.finish as FinishKey, {
      B: bg, C: lastChainPattern, N: activeAdj.count, hi, F: fogReveal, dynamicFirst,
    });
    if(finRes.score>0){
      sg += finRes.score;
      detailLines.push(finRes.detail);
      specialPopupEntries.push({ value:finRes.score, label:FINISHES[activeSticker.finish as FinishKey].label });
    }

    const weatherDetails:string[] = [];
    const weatherPopupEntries:{ value:number; label:string }[] = [];

    if(mode==='party' && partyWeather.key==='晴朗' && activeSticker.material==='水晶贴'){
      const crystalTargets = placedAfter.filter(item=>item.instanceId!==activeSticker.instanceId && item.material==='水晶贴');
      let reboundTargets = crystalTargets;
      if(partyWeather.level===1) reboundTargets = crystalTargets.slice(0,1);
      if(partyWeather.level===2) reboundTargets = crystalTargets.slice(0,3);
      const reboundScore = reboundTargets.reduce((sum,item)=>sum + item.cells.reduce((cellSum:number,[dr,dc]:number[])=>cellSum + Math.max(0, n[item.row+dr]?.[item.col+dc]?.base || 0),0), 0);
      if(reboundScore>0){
        sg += reboundScore;
        weatherDetails.push(`晴朗折射 +${reboundScore}（重触发 ${reboundTargets.length} 个水晶贴）`);
        weatherPopupEntries.push({ value:reboundScore, label:'折射' });
      }
    }

    if(mode==='party' && partyWeather.key==='雷' && activeSticker.material==='镭射'){
      const radius = partyWeather.level;
      let chainScore = 0;
      for(let rr=Math.max(0, activeRow-radius); rr<=Math.min(ROWS-1, activeRow+radius+activeCells.length); rr++){
        for(let cc=Math.max(0, activeCol-radius); cc<=Math.min(COLS-1, activeCol+radius+activeCells.length); cc++){
          const inOwn = activeCells.some(([dr,dc])=>activeRow+dr===rr && activeCol+dc===cc);
          if(inOwn) continue;
          if(Math.abs((rr-activeRow))>radius && Math.abs((cc-activeCol))>radius) continue;
          const rollSeed = Math.abs((turn+1)*97 + rr*31 + cc*17 + partyLayer*13) % 100;
          if(rollSeed < 30){
            chainScore += Math.max(0, n[rr]?.[cc]?.base || 0);
          }
        }
      }
      if(chainScore>0){
        sg += chainScore;
        weatherDetails.push(`雷鸣连携 +${chainScore}（外圈 ${partyWeather.level} 层触发）`);
        weatherPopupEntries.push({ value:chainScore, label:'连携' });
      }
    }

    if(mode==='party' && partyWeather.key==='雨' && activeSticker.material==='泡泡贴' && sg + bg + pg > 0){
      const rainMultiplier = partyWeather.level===1 ? 1.5 : partyWeather.level===2 ? 2 : 3;
      const boostedBase = Math.max(0, Math.round(bg * (rainMultiplier - 1)));
      const boostedPattern = Math.max(0, Math.round(pg * (rainMultiplier - 1)));
      const boostedSpecial = Math.max(0, Math.round(sg * (rainMultiplier - 1)));
      bg += boostedBase;
      pg += boostedPattern;
      sg += boostedSpecial;
      const boostedTotal = boostedBase + boostedPattern + boostedSpecial;
      if(boostedTotal>0){
        weatherDetails.push(`雨幕亲水 +${boostedTotal}（×${rainMultiplier}）`);
        weatherPopupEntries.push({ value:boostedTotal, label:'亲水' });
      }
    }

    weatherDetails.forEach(detail=>detailLines.push(detail));
    weatherPopupEntries.forEach(entry=>specialPopupEntries.push(entry));

    const nb = baseScore + bg;
    const np = patternScore + pg;
    const ns = specialScore + sg;
    const nt = nb * Math.max(1,np) * Math.max(1,ns);
    const popupCells = activeCells.map(([dr,dc])=>[activeRow + dr, activeCol + dc] as [number,number]);

    setBoard(upgrade ? upgrade.board : n);
    setPlaced(placedAfter);
    setBaseScore(nb); setPatternScore(np); setSpecialScore(ns);
    setTurn(v=>v+1);
    setFabricStack(nextFabricStack);
    setLastChainPattern(pg);
    if(activeSticker.finish==='动态贴纸'){
      setDynamicTurn({turn, fired:true});
    }

    const matLabel = MATERIALS[activeSticker.material as MaterialKey].label;
    const finLabel = FINISHES[activeSticker.finish as FinishKey].label;
    setMessage(upgrade ? `${scoreStickerIds.length>1 ? '相邻变体' : activeSticker.name} 升级成功！基础 +${bg}，构型 +${pg}，材质特效 +${sg}。` : `${matLabel} · ${activeSticker.name}：基础 +${bg}，构型 +${pg}，材质特效 +${sg}。`);

    // 浮字
    if(bg>0) pushFloat(`基础分 +${bg}`, 'base');
    if(pg>0) pushFloat(`构型分 +${pg}`, 'pattern');
    if(sg>0) pushFloat(`材质特效分 +${sg}`, 'special');
    playMaterialSound(activeSticker.material as StickerMaterialKey);
    if(bg>0) playBaseScoreSound();
    let popupStackIndex = 0;
    if(bg>0) pushBoardScorePopups(popupCells, bg, 'base', '基础', popupStackIndex++);
    if(pg>0) pushBoardScorePopups(popupCells, pg, 'pattern', '构型', popupStackIndex++);
    specialPopupEntries.forEach(entry=>pushBoardScorePopups(popupCells, entry.value, 'special', entry.label, popupStackIndex++));
    if(upgrade) pushFloat(`${activeSticker.name} 升级！`, 'special');
    extraUpgraded.forEach((item:any)=>pushFloat(`${item.name} 共鸣升级！`, 'special'));
    detailLines.forEach(d=> pushFloat(d, 'special'));

    const logLines = [
      `${activeSticker.name}（${matLabel} / ${finLabel}）：基础 +${bg}，构型 +${pg}，特效 +${sg}`,
      ...(upgrade ? [`  · 由 ${x.name} 触发升级，继承 ${upgrade.inherited.name} 的材质与外观`] : []),
      ...extraUpgraded.map((item:any)=>`  · 相邻贴纸同步升级为 ${item.name}`),
      ...detailLines.map(d=>`  · ${d}`),
    ];
    setLogs(cur=>[...logLines, ...cur].slice(0,12));

    if(mode==='story'){
      const nextMilestone = Math.floor(nt / 1000);
      const gainedCoins = Math.max(0, nextMilestone - scoreCoinMilestone);
      if(gainedCoins>0){
        setCoins(v=>v + gainedCoins);
        setScoreCoinMilestone(nextMilestone);
        setCoinBurst({ id:`story-score-${Date.now()}`, source:'score', amount:gainedCoins, label:`+${gainedCoins} 硬币` });
        pushFloat(`硬币 +${gainedCoins}`, 'special');
      }
    }

    // 触发入场特效展演
    setFxEvent({ id:`fx-${Date.now()}`, material:activeSticker.material as MaterialKey, finish:activeSticker.finish as FinishKey, asset:activeSticker.asset, name:activeSticker.name, isUpgrade:!!upgrade, animationFrames:activeSticker.animationFrames });

    updateOrder('place',1,nt);
    if(activeSticker.type==='食物') updateOrder('food',1,nt);
    if(activeAdj.count>0) updateOrder('adjacent',activeAdj.count,nt);
    if(activeSticker.material!=='普通') updateOrder('material',1,nt);
    if(activeSticker.finish!=='普通'){ updateOrder('finish',1,nt); updateOrder('material',1,nt); }
    if(hi>0) updateOrder('high',hi,nt);
    if(stack) updateOrder('stack',1,nt);
    if(effectiveUpgradeCount>0 || activeAdj.same>=2) updateOrder('upgrade',effectiveUpgradeCount || 1,nt);
    updateOrder('score',0,nt);

    setProgress((cur:any)=>({...cur,bestScore:Math.max(cur.bestScore,nt),collection:Array.from(new Set([...cur.collection,activeSticker.id]))}));
    // 在 CODEX 矩阵范围内的 (id, material, finish) 也立即解锁，方便日记中使用刚贴上的版本
    const m = activeSticker.material as CMaterial; const f = activeSticker.finish as CFinish;
    if(CODEX_MATERIALS.includes(m) && CODEX_FINISHES.includes(f)){
      const k = encodeUnlockKey(activeSticker.id, m, f);
      setUnlocks(cur=>{
        const base = cur.includes(k)?cur:[...cur,k];
        if(upgrade?.rule.unlockStickerIds?.length){
          return upgrade.rule.unlockStickerIds.reduce((acc,id)=>unlockStickerFamily(acc,id), base);
        }
        return base;
      });
    }
    refreshOne(i);
    setTimeout(()=>{ maybe(nt); checkPartyFail(); },80);
  };

  // 预览源：拖动中优先用 dragIndex，否则用当前选中（鼠标悬停时也显示预览）
  const previewIndex: number | null = dragIndex !== null ? dragIndex : (hoverCell ? selectedIndex : null);

  const footprint = (r:number,c:number)=>{
    // dragIndex 不为 null（真在拖动）或 hoverCell 不为 null（鼠标在棋盘上悬停）才显示预览
    if(previewIndex===null || !hoverCell) return '';
    const i = previewIndex;
    const x = candidates[i];
    if(!x) return '';
    const cells = x.kind==='sticker' ? rotShape(x.shape,x.rotation) : [[0,0]];
    const onShape = cells.some(([dr,dc])=>hoverCell.row+dr===r && hoverCell.col+dc===c);
    if(!onShape) return '';
    return can(i,hoverCell.row,hoverCell.col) ? 'drop-footprint-valid' : 'drop-footprint-invalid';
  };

  const rotate = ()=>{
    if(selected.kind!=='sticker'){ setMessage('功能道具不需要旋转。'); return; }
    playUiClick();
    setCandidates(cur=>cur.map((x,i)=>i===selectedIndex && x.kind==='sticker'?{...x,rotation:(x.rotation+90)%360}:x));
    setMessage('贴纸已旋转，轮廓和棋盘预览已更新。');
  };
  const refresh = ()=>{
    if(coins<3){ setMessage('硬币不足，刷新需要 3 枚硬币。'); return; }
    playUiClick();
    setCoins(v=>v-3);
    setCandidates([cand(level,total+31),cand(level,total+37),cand(level,total+41)]);
  };
  const recycle = ()=>{
    if(coins<5||!placed.length){ setMessage('回收需要 5 枚硬币，且棋盘上要有贴纸。'); return; }
    playUiClick();
    const t = placed[placed.length-1];
    const n = board.map(line=>line.map(cell=>({...cell})));
    t.cells.forEach(([dr,dc]:number[])=>{
      const cell = n[t.row+dr][t.col+dc];
      if(cell.stackId===t.instanceId) cell.stackId=null;
      if(cell.stickerId===t.instanceId) cell.stickerId=null;
    });
    setBoard(n);
    setPlaced(cur=>cur.slice(0,-1));
    setCoins(v=>v-5);
    setMessage(`回收移除了 ${t.name}。`);
  };

  return <main className="min-h-screen overflow-hidden bg-[#FFF7E8] text-[#594A3C]">
    <div className="fixed inset-0 pointer-events-none desk-pattern"/>
    {/* 全屏贴入庆祝特效：覆盖整个视窗，约 750ms 自动消失，不阻塞交互 */}
    <FullscreenFx event={fxEvent}/>
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header className="z-10 flex items-center justify-between gap-3 rounded-[2rem] border-4 border-white/80 bg-white/60 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 账号头像贴纸：贴在品牌按钮左外侧，不覆盖按钮文字；非 home 模式下显示且禁用点击（仅保留 hover/title） */}
          {mode!=='home' && (
            <AccountBadge
              account={account}
              onChanged={onAccountChange}
              size="md"
              interactive={false}
              className="account-sticker-pill"
            />
          )}
          <button onClick={()=>{ playUiBack(); setMode('home'); }} className="flex items-center gap-2 rounded-full bg-[#FFB7C5] px-4 py-2 font-black text-[#594A3C] shadow-md"><Sparkles className="h-5 w-5"/>开心贴贴账</button>
        </div>
        <div className="hidden text-sm font-bold sm:block">7 材质 · 5 外观 · 15 拓扑 · 三乘区结算</div>
        <div className="flex items-center gap-3">
          <button className="relative rounded-2xl bg-[#F7C948] p-3 text-[#594A3C] shadow-md"><PackageOpen className="h-6 w-6"/><span className="absolute -right-1 -top-1 rounded-full bg-[#FF7E93] px-1.5 text-xs text-white">3</span></button>
        </div>
      </header>

      {mode==='home' && <Home progress={progress} onEnter={enter} account={account} onAccountChange={onAccountChange}/>}
      {mode==='storyMenu' && <StoryLevelSelect levels={L} progress={progress} onSelect={enterStoryLevel} onBack={()=>setMode('home')}/>}
      {mode==='shop' && <ShopPage progress={progress} onBack={()=>setMode('home')} onBuy={buyShopItem}/>}
      {mode==='diary' && <Diary unlocks={unlocks} onBack={()=>setMode('home')} onPublish={()=>setProgress((cur:any)=>({...cur,diaryPages:cur.diaryPages+1}))}/>}

      {(mode==='story'||mode==='party') && <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[1fr_540px]">
        <div className="min-w-0 rounded-[2.5rem] border-4 border-white bg-[#FFFDF7]/90 p-4 shadow-2xl">
          {mode==='party' ? <div className="party-top-stage mb-3">
            <div className="party-scene-stage-bg" aria-hidden="true">
              <img className="party-scene-frame" src={partySceneFrames[partySceneFrameIndex]} alt="" draggable={false} />
            </div>
            <div className="party-top-stage-foreground">
              <div className="party-top-stage-header">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#9B7D62]">派对高分 · 轻肉鸽</p>
                  <h2 className="text-3xl font-black">第 {partyLayer} 层</h2>
                </div>
                <div className="party-weather-header-animation" aria-hidden="true">
                  {partyWeatherFrames.map((frame,index)=><img key={`header-${partyWeather.key}-${frame}-${index}`} className="party-weather-frame" src={frame} alt="" draggable={false} style={{ animationDelay: `-${(index / partyWeatherFrames.length) * 1.2}s` }} />)}
                </div>
              </div>
              <div className="score-row party-score-row">
                <ScoreTile label="基础" value={baseScore} variant="base"/>
                <span className="score-op" aria-hidden="true">×</span>
                <ScoreTile label="构型" value={patternScore} variant="pattern"/>
                <span className="score-op" aria-hidden="true">×</span>
                <ScoreTile label="材质特效" value={specialScore} variant="special"/>
                <span className="score-op score-op-eq" aria-hidden="true">=</span>
                <ScoreTile label="总分" value={total} variant="total"/>
              </div>
            </div>
          </div> : <div className="story-top-stage mb-3">
            <div className="min-w-0 story-top-stage-title">
              <p className="text-sm font-black text-[#9B7D62]">{`剧情模式 · 第 ${level.ch} 章`}</p>
              <h2 className="text-3xl font-black">{`${level.key} ${level.name}`}</h2>
            </div>
            <div className="score-row story-score-row">
              <ScoreTile label="基础" value={baseScore} variant="base"/>
              <span className="score-op" aria-hidden="true">×</span>
              <ScoreTile label="构型" value={patternScore} variant="pattern"/>
              <span className="score-op" aria-hidden="true">×</span>
              <ScoreTile label="材质特效" value={specialScore} variant="special"/>
              <span className="score-op score-op-eq" aria-hidden="true">=</span>
              <ScoreTile label="总分" value={total} variant="total"/>
            </div>
          </div>}

          <div className={`board-frame chapter-${level.ch}`}>
            <div className="game-board-wrap">
              <div
                ref={boardRef}
                className="game-board story-map"
                style={mode==='story' && level?.key && STORY_COVERS[level.key]
                  ? ({ ['--board-cover-url' as any]: `url("${STORY_COVERS[level.key]}")` } as React.CSSProperties)
                  : undefined}
                onMouseLeave={()=>{ if(dragIndex===null) setHoverCell(null); }}
                onDragLeave={(e)=>{
                  // 仅当离开整个棋盘容器（而不是在格子之间切换）时清除高亮，避免闪烁
                  const rt = e.relatedTarget as Node | null;
                  if(!rt || !(e.currentTarget as Node).contains(rt)) setHoverCell(null);
                }}
              >
                {board.map((row,rowIndex)=>row.map((cell,colIndex)=>{
                  const ok = can(previewIndex??selectedIndex,rowIndex,colIndex);
                  // 只对预览拓扑覆盖的格子上色（footprint 已处理），普通 hover 不再统一染全盘
                  const fp = footprint(rowIndex,colIndex);
                  const feedback = fp ? (fp==='drop-footprint-valid'?'drop-valid':'drop-invalid') : '';
                  const hover = hoverCell?.row===rowIndex && hoverCell?.col===colIndex ? 'drop-hover' : '';
                  return <button key={`${rowIndex}-${colIndex}`}
                    onClick={()=>place(selectedIndex,rowIndex,colIndex)}
                    onMouseEnter={()=>setHoverCell({row:rowIndex,col:colIndex})}
                    onDragEnter={(e)=>{e.preventDefault();setHoverCell({row:rowIndex,col:colIndex});}}
                    onDragOver={(e)=>{e.preventDefault();e.dataTransfer.dropEffect=ok?'move':'none';setHoverCell({row:rowIndex,col:colIndex});}}
                    onDrop={(e)=>{e.preventDefault();const idx=Number(e.dataTransfer.getData('text/plain'));setDragIndex(null);setHoverCell(null);place(Number.isInteger(idx)?idx:selectedIndex,rowIndex,colIndex);}}
                    className={`board-cell terrain-${cell.terrain} ${ok?'can-place':''} ${cell.stickerId?'occupied':''} ${cell.sponge?'has-sponge':''} ${feedback} ${hover} ${fp}`}>
                    <span className="cell-score">{cell.terrain==='fog'?'?':cell.base}</span>
                    {(()=>{
                      const tag = cell.terrain==='normal'?(cell.base>=3?'高分':cell.base===2?'加分':''):cell.terrain==='reward'?'目标':cell.terrain==='fog'?'迷雾':cell.terrain==='crate'?'纸箱':cell.terrain==='stain'?'污渍':cell.terrain==='masked'?'锁定':'';
                      return tag ? <span className="cell-type-tag">{tag}</span> : null;
                    })()}
                    {cell.terrain==='crate' && <Box className="terrain-icon"/>}
                    {cell.terrain==='stain' && <span className="terrain-emoji">●</span>}
                    {cell.terrain==='fog' && <span className="terrain-emoji">?</span>}
                    {cell.terrain==='reward' && <Star className="terrain-icon reward"/>}
                    {cell.sponge && <span className="sponge-dot">胶</span>}
                  </button>;
                }))}
              </div>
              {/* 整体异形贴纸覆盖层：作为棋盘的“覆盖层”，使用与 game-board 完全相同的 grid 模板与 padding/gap，
                  绝对定位贴在 game-board 之上；不参与 game-board 自身的网格排布，因此格子不会被挤走或替换。
                  pointer-events:none 让格子继续接收点击 / 拖拽事件。 */}
              <div className="game-board-overlay" aria-hidden="true">
                {boardScorePopups.map(popup=><span key={popup.id} className={`board-score-popup board-score-popup-${popup.kind}`} style={{
                  gridColumn: `${popup.col+1}`,
                  gridRow: `${popup.row+1}`,
                  zIndex: `${10 + popup.stackIndex}`,
                  ['--popup-dx' as any]: `${popup.dx}px`,
                  ['--popup-dy' as any]: `${popup.dy}px`,
                  ['--popup-delay' as any]: `${popup.delay}ms`,
                }}>{popup.label ? `${popup.label} +${popup.value}` : `+${popup.value}`}</span>)}
                {placed.map((p,idx)=>{
                  const layout = shapeLayout(p.shape, p.rotation || 0);
                  const shapeRows = layout.rows;
                  const shapeCols = layout.cols;
                  const visualBox = shapeVisualBox(p.shape, p.rotation || 0);
                  const shapeClip = shapePolygon(layout.cells);
                  const [centerR,centerC] = shapeCenterCell(layout.cells);
                  const labelLeft = ((centerC + 0.5) / shapeCols) * 100;
                  const labelTop = ((centerR + 0.5) / shapeRows) * 100;
                  const matVis = MATERIALS[p.material as MaterialKey].visual;
                  const finVis = FINISHES[p.finish as FinishKey].visual;
                  return <div key={`shape-${p.instanceId}-${idx}`}
                    className={`shape-sticker ${matVis} ${finVis} ${p.stacked?'is-stacked':''}`}
                    style={{
                      gridColumn: `${p.col+1} / span ${shapeCols}`,
                      gridRow: `${p.row+1} / span ${shapeRows}`,
                      ['--shape-rows' as any]: `${shapeRows}`,
                      ['--shape-cols' as any]: `${shapeCols}`,
                    }}>
                    <StickerRender
                      asset={p.asset}
                      alt={p.name}
                      rotation={p.rotation || 0}
                      visualBox={visualBox}
                      shapeClip={shapeClip}
                      material={p.material}
                      finish={p.finish}
                      animationFrames={p.animationFrames}
                      variant="placed"
                    />
                    {/* 视觉重心：仅多格贴纸显示名字标签 */}
                    {p.cells.length>1 && <span className="shape-sticker-name" style={{left:`${labelLeft}%`, top:`${labelTop}%`}}>{p.name}</span>}
                  </div>;
                })}
                {/* 半透明 ghost 预览：选中贴纸 + 鼠标悬停（或拖动）时显示当前 rotation 下的贴纸轮廓 */}
                {(() => {
                  if(previewIndex===null || !hoverCell) return null;
                  const x = candidates[previewIndex];
                  if(!x || x.kind!=='sticker') return null;
                  const layout = shapeLayout(x.shape, x.rotation || 0);
                  const cells = rotShape(x.shape, x.rotation);
                  const minR = Math.min(...cells.map(([r])=>r));
                  const minC = Math.min(...cells.map(([,c])=>c));
                  const shapeRows = layout.rows;
                  const shapeCols = layout.cols;
                  const visualBox = shapeVisualBox(x.shape, x.rotation || 0);
                  const shapeClip = shapePolygon(layout.cells);
                  const ok = can(previewIndex, hoverCell.row, hoverCell.col);
                  const startR = hoverCell.row + minR;
                  const startC = hoverCell.col + minC;
                  if(startR < 0 || startC < 0 || startR + shapeRows > ROWS || startC + shapeCols > COLS) return null;
                  return <div className={`ghost-preview ${ok?'ghost-valid':'ghost-invalid'}`}
                    style={{
                      gridColumn: `${startC+1} / span ${shapeCols}`,
                      gridRow: `${startR+1} / span ${shapeRows}`,
                      ['--shape-rows' as any]: `${shapeRows}`,
                      ['--shape-cols' as any]: `${shapeCols}`,
                    }} aria-hidden="true">
                    <StickerRender
                      asset={x.asset}
                      alt=""
                      rotation={x.rotation || 0}
                      visualBox={visualBox}
                      shapeClip={shapeClip}
                      material={x.material}
                      finish={x.finish}
                      animationFrames={variantAnimationFrames(x.id)}
                      variant="ghost"
                      valid={ok}
                    />
                  </div>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {mode==='story' ? <aside className="space-y-4 rounded-[2.5rem] border-4 border-white bg-white/80 p-4 shadow-2xl">
          <div className="rounded-3xl bg-[#FFF7E8] p-4">
            <h4 className="mb-3 flex items-center gap-2 font-black"><Trophy className="h-5 w-5 text-[#F7C948]"/>剧情订单</h4>
            <div className="space-y-2">{orders.map((o,i)=><ProgressBar key={`${o.kind}-${i}`} order={o}/>)}</div>
          </div>

          <div className="rounded-3xl bg-[#FFF7E8] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 font-black"><Star className="h-5 w-5 text-[#F7C948]"/>关卡评星进度</h4>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#9B7D62]">已收集：{'★'.repeat(collectedStoryStars)}{'☆'.repeat(3-collectedStoryStars)}</span>
            </div>
            <div className="story-star-progress-wrap">
              <div className="story-star-progress-bar">
                <div className="story-star-progress-fill" style={{width:`${Math.round(storyStarProgress * 100)}%`}} />
              </div>
              <div className="story-star-progress-marks">
                {[1,2,3].map(count=>{
                  const reached = stars >= count;
                  return <div key={count} className={`story-star-mark ${reached ? 'is-reached' : ''}`} style={{left:`${(count / 3) * 100}%`}}>
                    <div className="story-star-mark-icon">★</div>
                    <div className="story-star-mark-score">{level.star * count}</div>
                  </div>;
                })}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-black text-[#7A6958]">
              <span>当前得分：{total}</span>
              <span>当前可达：{'★'.repeat(stars)}{'☆'.repeat(3-stars)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">候选贴纸</h3>
            <div className="rounded-full bg-[#FFF7E8] px-3 py-1 text-xs font-black">回合 {turn} · 布料 {fabricStack}/3</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {candidates.map((c,i)=><button key={c.instanceId}
              draggable
              onDragStart={(e)=>{
                e.dataTransfer.setData('text/plain',String(i));
                setSelectedIndex(i); setDragIndex(i);
                const ghost = document.createElement('div');
                ghost.className='drag-ghost';
                ghost.style.cssText='position:fixed;top:-9999px;left:-9999px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;pointer-events:none;background:transparent;border:none;';
                if(c.kind==='sticker'){
                  const img=document.createElement('img');
                  img.src=c.asset;
                  img.style.cssText='width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(89,74,60,.25));';
                  ghost.appendChild(img);
                } else {
                  ghost.style.fontSize='48px'; ghost.textContent=c.icon;
                }
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost,40,40);
                setTimeout(()=>{ if(ghost.parentNode) ghost.parentNode.removeChild(ghost); },0);
              }}
              onDragEnd={()=>{ setDragIndex(null); setHoverCell(null); }}
              onClick={()=>setSelectedIndex(i)}
              className={`candidate-card kind-${c.kind} ${selectedIndex===i?'selected':''}`}>
              <div className="candidate-kind-badge">{c.kind==='sticker'?'贴纸':'道具'}</div>
              {c.kind==='sticker' ? (()=>{
                const baseRows = Math.max(...c.shape.map(([r]:number[])=>r))+1;
                const baseCols = Math.max(...c.shape.map(([,col]:number[])=>col))+1;
                const CANDIDATE_BOX = 96;
                const ratio = baseCols / baseRows;
                let innerW: number, innerH: number;
                if (ratio >= 1) { innerW = CANDIDATE_BOX; innerH = CANDIDATE_BOX / ratio; }
                else { innerH = CANDIDATE_BOX; innerW = CANDIDATE_BOX * ratio; }
                return <div className="candidate-art shape-preview" style={{width:`${CANDIDATE_BOX}px`, height:`${CANDIDATE_BOX}px`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div style={{width:`${innerW}px`, height:`${innerH}px`, transform:`rotate(${c.rotation}deg)`, transformOrigin:'center center', display:'flex', alignItems:'center', justifyContent:'center'} as React.CSSProperties}>
                    <img src={c.asset} alt={c.name} draggable={false}
                         className={`candidate-shape-img ${MATERIALS[c.material as MaterialKey].visual} ${FINISHES[c.finish as FinishKey].visual}`}
                         style={{width:'100%', height:'100%', objectFit:'contain'} as React.CSSProperties}/>
                  </div>
                </div>;
              })() : <div className="candidate-art"><span>{c.icon}</span></div>}
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between gap-2">
                  <strong>{c.name}</strong>
                  {c.kind==='sticker' && <span className="rounded-full bg-[#FFF7E8] px-2 py-1 text-[10px] font-black">{c.rotation}°</span>}
                </div>
                <p className="mt-1 text-xs font-bold text-[#7A6958]">{c.kind==='sticker'?`形状：${SHAPE_LABEL[c.shapeKey]||''}`:c.note}</p>
                {c.kind==='sticker' && <div className="mt-2 flex flex-wrap gap-1">
                  <span className="tag">{c.type}</span>
                  <span className={`tag tag-${MATERIALS[c.material as MaterialKey].visual}`} title={MATERIALS[c.material as MaterialKey].desc}>{c.material}</span>
                  <span className={`tag tag-${FINISHES[c.finish as FinishKey].visual}`} title={FINISHES[c.finish as FinishKey].desc}>{c.finish}</span>
                </div>}
              </div>
            </button>)}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={rotate} className="tool-button"><RotateCw className="h-4 w-4"/>旋转</button>
            <button onClick={refresh} className="tool-button"><RefreshCw className="h-4 w-4"/>刷新</button>
            <button onClick={recycle} className="tool-button"><Eraser className="h-4 w-4"/>回收</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Pill label="硬币" value={coins}/>
            <Pill label="剧情目标" value={level.goal}/>
            <Pill label="星级" value={'★'.repeat(stars)}/>
          </div>

          <div className="rounded-3xl bg-white/70 p-4 shadow-inner">
            <h4 className="mb-2 flex items-center gap-2 font-black"><Layers className="h-4 w-4"/>得分日志</h4>
            <div className="space-y-2 text-xs font-bold text-[#7A6958] max-h-56 overflow-y-auto">
              {logs.length===0?<p>贴入后会显示基础分、构型分和材质外观分。</p>:logs.map((log,idx)=><p key={`${log}-${idx}`} className="rounded-2xl bg-[#FFF7E8] p-2">{log}</p>)}
            </div>
          </div>
        </aside> : <aside className="space-y-4 rounded-[2.5rem] border-4 border-white bg-[#FFF8EE] p-4 shadow-2xl">
          <div className="rounded-3xl bg-white p-4 shadow-inner">
            <h4 className="mb-2 flex items-center gap-2 font-black"><Trophy className="h-5 w-5 text-[#F7C948]"/>派对高分</h4>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Pill label="当前总分" value={total}/>
              <Pill label="目标总分" value={level.targetScore}/>
              <Pill label="硬币" value={coins}/>
              <Pill label="层数" value={`第 ${partyLayer} 层`}/>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-inner">
            <h4 className="mb-2 flex items-center gap-2 font-black"><Sparkles className="h-5 w-5 text-[#7A8CFF]"/>天气与场景效果</h4>
            <div className="space-y-3 text-sm font-bold text-[#7A6958] leading-6">
              <div className="rounded-2xl bg-[#FFF7E8] px-4 py-3">
                <strong className="block text-[#594A3C]">{partyScene.key} · {PARTY_SCENE_LABELS[partyScene.key]}</strong>
                <span>{partySceneDescription}</span>
              </div>
              <div className="rounded-2xl bg-[#FFF7E8] px-4 py-3">
                <strong className="block text-[#594A3C]">{PARTY_WEATHER_LABELS[partyWeather.key]}</strong>
                <span>{partyWeatherDescription}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">候选内容</h3>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-black">回合 {turn} · 布料 {fabricStack}/3</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {candidates.map((c,i)=><button key={c.instanceId}
              draggable
              onDragStart={(e)=>{
                e.dataTransfer.setData('text/plain',String(i));
                setSelectedIndex(i); setDragIndex(i);
                const ghost = document.createElement('div');
                ghost.className='drag-ghost';
                ghost.style.cssText='position:fixed;top:-9999px;left:-9999px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;pointer-events:none;background:transparent;border:none;';
                if(c.kind==='sticker'){
                  const img=document.createElement('img');
                  img.src=c.asset;
                  img.style.cssText='width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(89,74,60,.25));';
                  ghost.appendChild(img);
                } else {
                  ghost.style.fontSize='48px'; ghost.textContent=c.icon;
                }
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost,40,40);
                setTimeout(()=>{ if(ghost.parentNode) ghost.parentNode.removeChild(ghost); },0);
              }}
              onDragEnd={()=>{ setDragIndex(null); setHoverCell(null); }}
              onClick={()=>setSelectedIndex(i)}
              className={`candidate-card kind-${c.kind} ${selectedIndex===i?'selected':''}`}>
              <div className="candidate-kind-badge">{c.kind==='sticker'?'贴纸':'道具'}</div>
              {c.kind==='sticker' ? (()=>{
                const baseRows = Math.max(...c.shape.map(([r]:number[])=>r))+1;
                const baseCols = Math.max(...c.shape.map(([,col]:number[])=>col))+1;
                const CANDIDATE_BOX = 96;
                const ratio = baseCols / baseRows;
                let innerW: number, innerH: number;
                if (ratio >= 1) { innerW = CANDIDATE_BOX; innerH = CANDIDATE_BOX / ratio; }
                else { innerH = CANDIDATE_BOX; innerW = CANDIDATE_BOX * ratio; }
                return <div className="candidate-art shape-preview" style={{width:`${CANDIDATE_BOX}px`, height:`${CANDIDATE_BOX}px`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div style={{width:`${innerW}px`, height:`${innerH}px`, transform:`rotate(${c.rotation}deg)`, transformOrigin:'center center', display:'flex', alignItems:'center', justifyContent:'center'} as React.CSSProperties}>
                    <img src={c.asset} alt={c.name} draggable={false}
                         className={`candidate-shape-img ${MATERIALS[c.material as MaterialKey].visual} ${FINISHES[c.finish as FinishKey].visual}`}
                         style={{width:'100%', height:'100%', objectFit:'contain'} as React.CSSProperties}/>
                  </div>
                </div>;
              })() : <div className="candidate-art"><span>{c.icon}</span></div>}
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between gap-2">
                  <strong>{c.name}</strong>
                  {c.kind==='sticker' && <span className="rounded-full bg-[#FFF7E8] px-2 py-1 text-[10px] font-black">{c.rotation}°</span>}
                </div>
                <p className="mt-1 text-xs font-bold text-[#7A6958]">{c.kind==='sticker'?`形状：${SHAPE_LABEL[c.shapeKey]||''}`:c.note}</p>
                {c.kind==='sticker' && <div className="mt-2 flex flex-wrap gap-1">
                  <span className="tag">{c.type}</span>
                  <span className={`tag tag-${MATERIALS[c.material as MaterialKey].visual}`} title={MATERIALS[c.material as MaterialKey].desc}>{c.material}</span>
                  <span className={`tag tag-${FINISHES[c.finish as FinishKey].visual}`} title={FINISHES[c.finish as FinishKey].desc}>{c.finish}</span>
                </div>}
              </div>
            </button>)}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={rotate} className="tool-button"><RotateCw className="h-4 w-4"/>旋转</button>
            <button onClick={refresh} className="tool-button"><RefreshCw className="h-4 w-4"/>刷新</button>
            <button onClick={recycle} className="tool-button"><Eraser className="h-4 w-4"/>回收</button>
          </div>

          <div className="rounded-3xl bg-white/80 p-4 shadow-inner">
            <h4 className="mb-2 flex items-center gap-2 font-black"><Layers className="h-4 w-4"/>冲分日志</h4>
            <div className="space-y-2 text-xs font-bold text-[#7A6958] max-h-56 overflow-y-auto">
              {logs.length===0?<p>派对高分会记录每次贴入后的得分变化与升级表现。</p>:logs.map((log,idx)=><p key={`${log}-${idx}`} className="rounded-2xl bg-[#FFF7E8] p-2">{log}</p>)}
            </div>
          </div>
        </aside>}
      </section>}

      {resultOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#594A3C]/35 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[2rem] border-4 border-white bg-[#FFF7E8] p-6 text-center shadow-2xl">
          <Sparkles className="mx-auto h-12 w-12 text-[#F7C948]"/>
          <h2 className="mt-3 text-3xl font-black">关卡结算</h2>
          <p className="mt-2 font-bold">{level.key} {level.name} · {mode==='story' ? storyStarsEarned : stars} 星</p>
          <p className="mt-2 text-4xl font-black">{total}</p>
          {mode==='story' ? (() => {
            const isLast = levelIndex >= L.length-1;
            return <>
              <div className="mt-4 rounded-3xl bg-white/75 px-4 py-3 shadow-inner">
                <div className="text-3xl tracking-[0.35em] text-[#F7C948]">{'★'.repeat(storyStarsEarned)}{'☆'.repeat(3-storyStarsEarned)}</div>
                <p className="mt-2 text-sm font-black text-[#7A6958]">订单全部完成后按得分评星，本次新增星星 {storyStarsDelta}</p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
              <button onClick={()=>{ playUiConfirm(); reset(levelIndex,mode); }} className="rounded-2xl border-2 border-[#F7C948]/40 bg-white py-3 font-black text-[#594A3C] shadow">重玩本关</button>
              <button onClick={()=>{ playUiBack(); setResultOpen(false); setMode('storyMenu'); }} className="rounded-2xl border-2 border-[#FFB7C5]/55 bg-white py-3 font-black text-[#594A3C] shadow">返回目录</button>
              <button onClick={()=>{ if(!isLast){ playUiConfirm(); reset(levelIndex+1,mode); } }} disabled={isLast} className={`rounded-2xl py-3 font-black shadow ${isLast?'cursor-not-allowed bg-[#EFE3CF] text-[#A89A82]':'bg-gradient-to-r from-[#F7C948] to-[#FFB7C5] text-[#594A3C]'}`}>{isLast?'已通关':'下一关'}</button>
              </div>
            </>;
          })() : <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={()=>{ playUiConfirm(); reset(levelIndex,mode); }} className="rounded-2xl bg-white py-3 font-black shadow">再来一局</button>
            <button onClick={()=>{ playUiConfirm(); reset(Math.min(levelIndex+1,L.length-1),mode); }} className="rounded-2xl bg-[#FFB7C5] py-3 font-black shadow">下一关</button>
          </div>}
        </div>
      </div>}
      {/* 派对模式 · 弹幕通知层 */}
      <PartyBulletStream active={mode==='party'}/>

      {coinBurst && <div className={`coin-burst coin-burst-${coinBurst.source}`} key={coinBurst.id}>
        <div className="coin-burst-token">🪙</div>
        <span>{coinBurst.label}</span>
      </div>}

      {partyChoiceOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#594A3C]/45 p-4 backdrop-blur-sm">
        <div className="w-full max-w-3xl rounded-[2rem] border-4 border-white bg-[#FFF7E8] p-6 shadow-2xl">
          <h2 className="text-center text-3xl font-black">进入下一层前，选择一个奖励</h2>
          <p className="mt-2 text-center text-sm font-bold text-[#7A6958]">当前为占位奖励，后续可扩展为更多能力与内容。</p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {partyChoices.map(choice=>{
              const visual = getPartyChoiceVisual(choice);
              return <button key={choice.id} onClick={()=>{ playUiConfirm(); choosePartyReward(choice); }} className={`party-choice-card ${visual.toneClass}`}>
                <div className="party-choice-card-top">
                  <span className="party-choice-card-badge">{visual.badge}</span>
                  <span className="party-choice-card-title">{choice.title}</span>
                </div>
                <div className="party-choice-card-main">
                  <div className="party-choice-card-icon">{visual.icon}</div>
                  <div className="party-choice-card-copy">
                    <strong className="party-choice-card-item">{visual.itemName}</strong>
                    <p className="party-choice-card-detail">{choice.detail}</p>
                  </div>
                </div>
              </button>;
            })}
          </div>
        </div>
      </div>}

      {/* 派对模式 · 进入下一层过场 */}
      {layerTransition.show && <div className="layer-transition" key={layerTransition.layer}>
        <div className="layer-transition-card">
          <Sparkles className="h-10 w-10 text-[#F7C948]"/>
          <h3>第 {layerTransition.layer} 层</h3>
          <p>新一层已生成，准备出发！</p>
        </div>
      </div>}

      {/* 派对模式 · 贴纸掉落提示 */}
      {dropToast && <div className="drop-toast" key={dropToast.id+dropToast.material+dropToast.finish}>
        <img src={dropToast.asset} alt={dropToast.name}/>
        <div className="drop-toast-info">
          <strong>获得新贴纸版本！</strong>
          <span>{dropToast.name} · {dropToast.material} / {dropToast.finish}</span>
          <span className="drop-toast-hint">已加入图鉴，可在日记模式中使用</span>
        </div>
      </div>}

      {/* 派对模式 · 失败对话框 */}
      {failOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#594A3C]/55 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[2rem] border-4 border-white bg-[#FFF7E8] p-6 text-center shadow-2xl">
          <h2 className="text-3xl font-black text-[#FF7E93]">挑战失败</h2>
          <p className="mt-2 font-bold">第 {partyLayer} 层未在限定贴纸数内达到目标总分。</p>
          <p className="mt-1 text-sm font-bold text-[#7A6958]">本次最高到达：第 {partyLayer} 层</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={partyExit} className="rounded-2xl bg-white py-3 font-black shadow">回到主界面</button>
            <button onClick={()=>{ playUiConfirm(); partyRestart(); }} className="rounded-2xl bg-[#FFB7C5] py-3 font-black shadow">从第 1 层开始</button>
          </div>
        </div>
      </div>}
    </div>
  </main>;
}
