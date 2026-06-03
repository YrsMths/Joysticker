import { useEffect } from 'react';
import { X } from 'lucide-react';

// 日记图鉴贴纸放大预览
// 整屏高斯模糊 + 半透明暗罩；贴纸图本体居中悬浮、保持透明 PNG；
// 关闭：点击空白 / ESC / 右上角 ✕
//
// 增量需求：在大图预览中也呈现对应的材质（material）和外观（finish）效果，
// 与小图保持一致 —— 复用全局 .shape-deco-* / .shape-finish-* 视觉样式，
// 在 <img> 之上叠加同样的装饰层。

type MaterialKey = '普通' | '镭射' | '布料' | '磨砂' | '水晶贴' | '泡泡贴' | '烫金';
type FinishKey = '普通' | '金色闪粉' | '彩色闪粉' | '动态贴纸' | '荧光贴纸';

type Props = {
  src: string | null;
  alt?: string;
  material?: MaterialKey;
  finish?: FinishKey;
  stickerId?: string | null;
  onClose: () => void;
};

const STAR_DYNAMIC_FRAMES = Array.from({ length: 33 }, (_, i) => `/assets/images/stickers/fantasy/sticker-star-dynamic/${i + 1}.png`);

export default function StickerLightbox({ src, alt, material, finish, stickerId, onClose }: Props) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;

  // 与棋盘贴纸 / 候选卡 / 日记贴纸盒保持一致的装饰类映射
  const decoMatClass =
    material === '镭射' ? 'shape-deco shape-deco-holo'
    : material === '布料' ? 'shape-deco shape-deco-fabric'
    : material === '磨砂' ? 'shape-deco shape-deco-frosted'
    : material === '水晶贴' ? 'shape-deco shape-deco-crystal'
    : material === '泡泡贴' ? 'shape-deco shape-deco-bubble'
    : material === '烫金' ? 'shape-deco shape-deco-gold'
    : '';
  const decoFinClass =
    finish === '金色闪粉' ? 'shape-finish shape-finish-gold'
    : finish === '彩色闪粉' ? 'shape-finish shape-finish-confetti'
    : finish === '动态贴纸' ? 'shape-finish shape-finish-dynamic'
    : finish === '荧光贴纸' ? 'shape-finish shape-finish-glow'
    : '';
  const animationFrames = stickerId === 'starry_star' ? STAR_DYNAMIC_FRAMES : null;

  return (
    <div className="sticker-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button
        type="button"
        className="sticker-lightbox-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="关闭"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="sticker-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        style={{ ['--sticker-mask' as never]: `url("${src}")` } as React.CSSProperties}
      >
        {animationFrames?.length ? (
          <div className="sticker-lightbox-animation" aria-hidden="true">
            {animationFrames.map((frame, index) => (
              <img
                key={`${frame}-${index}`}
                className="sticker-lightbox-frame"
                src={frame}
                alt=""
                draggable={false}
                style={{ animationDelay: `-${(index / animationFrames.length) * 1.1}s` }}
              />
            ))}
          </div>
        ) : (
          <img
            className="sticker-lightbox-img"
            src={src}
            alt={alt || ''}
            draggable={false}
          />
        )}
        {decoMatClass && <div className={decoMatClass} aria-hidden="true" />}
        {decoFinClass && <div className={decoFinClass} aria-hidden="true" />}
      </div>
    </div>
  );
}
