// 剧情模式关卡封面图映射 (v4 — 抽象表现版)
//
// 风格: 现代极简抽象表现主义 + 蜡笔粗线条 + 单色 + 仅线条 + 大量留白
//   参考语境: Saul Bass / Matisse line cutout / Joan Miró 抽象线条
//   每张严格只用一种主色，颜色分配保留 v3 节奏（章节内交替）
// 技术约束:
//   - 4:3 横版 (1024x768)，纯插画无文字 / 编号 / UI
//   - 直接引用 CDN URL，不下载到 public/assets/
//   - StoryLevelSelect 卡片样式 / 关卡棋盘 ::before 叠加层 (opacity:.22, mix-blend-mode:multiply) 保持不变
//
// 关卡 -> 主题灵感（已抽象化，不再字面描绘）-> 主色:
//   1-1 清晨窗台   -> 弧 + 平行线 + 浮点  -> cream yellow
//   1-2 小卖部     -> 短竖笔 + 波浪 + 散点 -> pink coral
//   1-3 公园长椅   -> 长曲线 + 斜笔 + 圆环 -> mint
//   1-4 美食街     -> 折线 + 上升螺旋 + 短划 -> warm gold
//   1-5 小型音乐会 -> 节奏竖线 + 横波 + 三角 -> warm brown
//   1-6 夜市       -> 波浪堆叠 + 散点 + 斜笔 -> sky blue
//   1-7 海边       -> 长波 + 平行短笔 + 半圆 -> mint
//   1-8 夏日广场   -> 大弧 + 放射线 + 双点   -> pink coral
//   2-1 检票口     -> 双竖 + 横线 + 三角     -> warm gold
//   2-2 旋转木马   -> 嵌套圆 + 斜切线        -> pink coral
//   2-3 气球摊     -> 三圆 + 飘带 + 点       -> sky blue
//   2-4 冰淇淋车   -> 上升螺旋 + 三角 + 短划 -> mint
//   2-5 演出区     -> 顶弧 + 竖笔群 + 圆点   -> warm brown
//   2-6 玩偶车     -> 重叠圆斑 + 内点 + 曲线 -> cream yellow
//   2-7 摩天轮     -> 大圆 + 部分辐条 + 横线 -> sky blue
//   2-8 烟花广场   -> 中心点 + 放射 + 散点   -> pink coral

export const STORY_COVERS: Record<string, string> = {
  // 第一章 暑期手账
  '1-1': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2qegiaagoq/story-cover-1-1-abstract-cream-v4.png',
  '1-2': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2qariaagnq/story-cover-1-2-abstract-pink-v4.png',
  '1-3': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2qfzyaagqq/story-cover-1-3-abstract-mint-v4.png',
  '1-4': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2qgxiaagqa/story-cover-1-4-abstract-gold-v4.png',
  '1-5': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2q4haaagpa/story-cover-1-5-abstract-brown-v4.png',
  '1-6': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2q4eyaagqa/story-cover-1-6-abstract-blue-v4.png',
  '1-7': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2q2hyaagpq/story-cover-1-7-abstract-mint-v4.png',
  '1-8': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2q4gaaagoq/story-cover-1-8-abstract-pink-v4.png',

  // 第二章 游乐场
  '2-1': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2ro7qaagnq/story-cover-2-1-abstract-gold-v4.png',
  '2-2': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2rpoaaagoq/story-cover-2-2-abstract-pink-v4.png',
  '2-3': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2rpaaaagqa/story-cover-2-3-abstract-blue-v4.png',
  '2-4': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2rpvaaagqq/story-cover-2-4-abstract-mint-v4.png',
  '2-5': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2sc7aaagqq/story-cover-2-5-abstract-brown-v4.png',
  '2-6': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2scfyaagqa/story-cover-2-6-abstract-cream-v4.png',
  '2-7': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2semaaagpq/story-cover-2-7-abstract-blue-v4.png',
  '2-8': 'https://mgx-backend-cdn.metadl.com/generate/images/1142356/2026-05-15/ot2sceqaagpa/story-cover-2-8-abstract-pink-v4.png',
};