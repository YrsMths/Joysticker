import type { StickerFinishKey, StickerMaterialKey } from './stickerVariants';

export const MATERIALS: Record<StickerMaterialKey,{label:string;desc:string;cap:number;visual:string}> = {
  '普通':   { label:'普通',   desc:'干净纸面，无能力',                       cap:0, visual:'mat-normal' },
  '镭射':   { label:'镭射',   desc:'追光：本回合若 C ≥ 1，对最后一次构型再结算 1 次（min 2C，上限 8）', cap:8, visual:'mat-holo' },
  '布料':   { label:'布料',   desc:'缝补：每贴 +1 蓄积，满 3 层兑现 +5（上限 5）', cap:5, visual:'mat-fabric' },
  '磨砂':   { label:'磨砂',   desc:'消噪：稳态命中 ×2，邻位污渍 +1（上限 7）', cap:7, visual:'mat-frosted' },
  '水晶贴': { label:'水晶贴', desc:'聚光：B ≥ 3 触发；奖励格再 +1（上限 9）', cap:9, visual:'mat-crystal' },
  '泡泡贴': { label:'泡泡贴', desc:'弹跳：邻接每命中 +1，≥3 群聚再 +2（上限 6）', cap:6, visual:'mat-bubble' },
  '烫金':   { label:'烫金',   desc:'点题：每推进订单 +2，完成再 +2（上限 10）', cap:10, visual:'mat-gold' },
};

export const FINISHES: Record<StickerFinishKey,{label:string;desc:string;cap:number;visual:string}> = {
  '普通':     { label:'普通',     desc:'素色，无装饰能力',                                    cap:0, visual:'fin-normal' },
  '金色闪粉': { label:'金色闪粉', desc:'高光：B ≥ 4 或 C ≥ 2 触发；奖励格再 +1（上限 4）',  cap:4, visual:'fin-gold' },
  '彩色闪粉': { label:'彩色闪粉', desc:'彩屑：每邻位 +1，N ≥ 3 再 +1（上限 5）',             cap:5, visual:'fin-confetti' },
  '动态贴纸': { label:'动态贴纸', desc:'节奏：本回合首触 +2，后续每次 +1（上限 2/次）',      cap:2, visual:'fin-dynamic' },
  '荧光贴纸': { label:'荧光贴纸', desc:'迷雾揭示：每邻接迷雾揭示并翻倍（min 2F，上限 8）',   cap:8, visual:'fin-glow' },
};
