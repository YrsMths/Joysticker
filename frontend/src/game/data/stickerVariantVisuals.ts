import type { StickerFinishKey, StickerMaterialKey } from './stickerVariants';

const MATERIAL_DECO_CLASSES: Partial<Record<StickerMaterialKey, string>> = {
  镭射: 'shape-deco shape-deco-holo',
  布料: 'shape-deco shape-deco-fabric',
  磨砂: 'shape-deco shape-deco-frosted',
  水晶贴: 'shape-deco shape-deco-crystal',
  泡泡贴: 'shape-deco shape-deco-bubble',
  烫金: 'shape-deco shape-deco-gold',
};

const FINISH_DECO_CLASSES: Partial<Record<StickerFinishKey, string>> = {
  金色闪粉: 'shape-finish shape-finish-gold',
  彩色闪粉: 'shape-finish shape-finish-confetti',
  呼吸贴纸: 'shape-finish shape-finish-dynamic',
  荧光贴纸: 'shape-finish shape-finish-glow',
};

export function getMaterialDecoClass(material?: StickerMaterialKey | null) {
  if (!material) return '';
  return MATERIAL_DECO_CLASSES[material] || '';
}

export function getFinishDecoClass(finish?: StickerFinishKey | null) {
  if (!finish) return '';
  return FINISH_DECO_CLASSES[finish] || '';
}

export function getStickerVariantDecoClasses(material?: StickerMaterialKey | null, finish?: StickerFinishKey | null) {
  return {
    materialClass: getMaterialDecoClass(material),
    finishClass: getFinishDecoClass(finish),
  };
}
