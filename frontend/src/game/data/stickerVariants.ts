export const ALL_MATERIAL_KEYS = ['普通','镭射','布料','磨砂','水晶贴','泡泡贴','烫金'] as const;
export const ALL_FINISH_KEYS = ['普通','金色闪粉','彩色闪粉','呼吸贴纸','荧光贴纸'] as const;

export type StickerMaterialKey = (typeof ALL_MATERIAL_KEYS)[number];
export type StickerFinishKey = (typeof ALL_FINISH_KEYS)[number];

export const CODEX_MATERIAL_KEYS = ['普通','镭射','布料','磨砂','水晶贴','泡泡贴','烫金'] as const;
export const CODEX_FINISH_KEYS = ['普通','金色闪粉','彩色闪粉','呼吸贴纸','荧光贴纸'] as const;

export type CodexMaterialKey = (typeof CODEX_MATERIAL_KEYS)[number];
export type CodexFinishKey = (typeof CODEX_FINISH_KEYS)[number];
