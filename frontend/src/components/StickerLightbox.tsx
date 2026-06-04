import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { StickerFinishKey, StickerMaterialKey } from '@/game/data/stickerVariants';
import { getStickerVariantDecoClasses } from '@/game/data/stickerVariantVisuals';

// 日记图鉴贴纸放大预览
// 整屏高斯模糊 + 半透明暗罩；贴纸图本体居中悬浮、保持透明 PNG；
// 关闭：点击空白 / ESC / 右上角 ✕
//
// 增量需求：在大图预览中也呈现对应的材质（material）和外观（finish）效果，
// 与小图保持一致 —— 复用全局 .shape-deco-* / .shape-finish-* 视觉样式，
// 在 <img> 之上叠加同样的装饰层。

type Props = {
  src: string | null;
  alt?: string;
  material?: StickerMaterialKey;
  finish?: StickerFinishKey;
  stickerId?: string | null;
  onClose: () => void;
};

const withBase = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const STAR_DYNAMIC_FRAMES = Array.from({ length: 33 }, (_, i) => withBase(`assets/images/stickers/fantasy/sticker-star-dynamic/${i + 1}.png`));

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
  const { materialClass: decoMatClass, finishClass: decoFinClass } = getStickerVariantDecoClasses(material, finish);
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
