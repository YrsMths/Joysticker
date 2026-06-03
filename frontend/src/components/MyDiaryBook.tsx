/**
 * MyDiaryBook
 * 我的手账本：翻页查看历史已发布的手账
 *
 * 数据结构（localStorage key: diary.book.v1）：
 *   DiaryEntry[]  按 publishedAt 升序保存
 *   - id: string (uuid 或时间戳)
 *   - publishedAt: ISO string
 *   - title: string  (发布时的标题，例如 "2026年5月15日 星期五")
 *   - items: DiaryItemSnapshot[]  (贴纸 + 文本贴布局快照)
 *
 * 交互：
 *   - 默认翻开「最近发布」（数组末尾）
 *   - 左右翻页 ← →，显示「第 N / 共 M 份」
 *   - 顶部日期下拉：列出所有发布日期，点选直接跳到那一天的第一份
 *   - 关闭按钮（右上 ✕），关闭回到日记页当前编辑状态
 *
 * 视觉：奶油色纸面 + 暖金描边，沿用全局字体与配色，不引入新视觉语言。
 */
import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, BookOpen, RotateCw } from 'lucide-react';

export type DiaryItemSnapshot = {
  id: string;
  kind: 'text' | 'sticker';
  x: number;
  y: number;
  rotation: number;
  scale: number;
  content?: string;
  asset?: string;
  name?: string;
  material?: string;
  finish?: string;
};

export type DiaryEntry = {
  id: string;
  publishedAt: string; // ISO
  title: string;
  items: DiaryItemSnapshot[];
};

import { getItem as acctGetItem, setItem as acctSetItem } from '@/lib/account';

export const DIARY_BOOK_KEY = 'diary.book.v1';

export function loadDiaryBook(): DiaryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = acctGetItem(DIARY_BOOK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DiaryEntry[];
  } catch {
    return [];
  }
}

export function saveDiaryBook(list: DiaryEntry[]) {
  try {
    acctSetItem(DIARY_BOOK_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function appendDiaryEntry(entry: DiaryEntry): DiaryEntry[] {
  const cur = loadDiaryBook();
  const next = [...cur, entry];
  saveDiaryBook(next);
  return next;
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function formatDateKey(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return iso;
  }
}

type Props = {
  onClose: () => void;
};

const MyDiaryBook: React.FC<Props> = ({ onClose }) => {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => loadDiaryBook());
  const total = entries.length;
  // 默认翻开最近一份（末尾）
  const [idx, setIdx] = useState<number>(total > 0 ? total - 1 : 0);

  useEffect(() => {
    // 锁定背景滚动
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 按日期分组 (YYYY-MM-DD -> entry indices)
  const dateGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    entries.forEach((e, i) => {
      const k = formatDateKey(e.publishedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return map;
  }, [entries]);

  const sortedDateKeys = useMemo(
    () => Array.from(dateGroups.keys()).sort(),
    [dateGroups]
  );

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => setIdx((i) => Math.min(total - 1, i + 1));

  const jumpToDate = (dateKey: string) => {
    const list = dateGroups.get(dateKey);
    if (!list || list.length === 0) return;
    setIdx(list[0]);
  };

  // 找当前 entry 所在的 dateKey，用于日期下拉显示
  const currentDateKey =
    total > 0 ? formatDateKey(entries[idx].publishedAt) : '';

  const current = total > 0 ? entries[idx] : null;

  return (
    <div className="diary-book-overlay" onClick={onClose}>
      <div
        className="diary-book-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="diary-book-header">
          <div className="diary-book-title">
            <BookOpen className="h-5 w-5 text-[#9B7D62]" />
            <span>我的手账本</span>
            {total > 0 && (
              <span className="diary-book-count">
                第 {idx + 1} / 共 {total} 份
              </span>
            )}
          </div>
          <div className="diary-book-tools">
            {sortedDateKeys.length > 0 && (
              <select
                className="diary-book-date-select"
                value={currentDateKey}
                onChange={(e) => jumpToDate(e.target.value)}
                title="按发布日期跳转"
              >
                {sortedDateKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}（{dateGroups.get(k)!.length} 份）
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="diary-book-close"
              onClick={onClose}
              title="关闭"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="diary-book-body">
          {total === 0 || !current ? (
            <div className="diary-book-empty">
              <BookOpen className="mb-3 h-12 w-12 text-[#C9A87A]" />
              <p className="text-lg font-black text-[#594A3C]">
                还没有发布过手账～
              </p>
              <p className="mt-2 text-sm font-bold text-[#7A6958]">
                完成一页创作后点击「发布到本地手账」即可保存到这里。
              </p>
            </div>
          ) : (
            <div className="diary-book-stage">
              <button
                type="button"
                className="diary-book-nav diary-book-nav-prev"
                onClick={goPrev}
                disabled={idx <= 0}
                title="上一份"
                aria-label="上一份"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <article className="diary-book-page" key={current.id}>
                <div className="diary-book-page-header">
                  <h3 className="diary-book-page-title">{current.title}</h3>
                  <span className="diary-book-page-meta">
                    发布于 {formatDateShort(current.publishedAt)}
                  </span>
                </div>
                <div className="diary-book-paper">
                  {current.items.length === 0 && (
                    <div className="diary-book-paper-empty">（这一页是空的）</div>
                  )}
                  {current.items.map((item) => {
                    const sc = item.scale || 1;
                    const style: React.CSSProperties = {
                      left: item.x,
                      top: item.y,
                      transform: `rotate(${item.rotation}deg) scale(${sc})`,
                      transformOrigin: 'top left',
                    };
                    if (item.kind === 'sticker') {
                      return (
                        <div
                          key={item.id}
                          className="diary-book-item"
                          style={style}
                        >
                          <div className="diary-item-sticker-wrap">
                            <img
                              src={item.asset}
                              alt={item.name || ''}
                              className="diary-item-sticker"
                              draggable={false}
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={item.id}
                        className="diary-book-item"
                        style={style}
                      >
                        <div className="diary-text">{item.content || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <button
                type="button"
                className="diary-book-nav diary-book-nav-next"
                onClick={goNext}
                disabled={idx >= total - 1}
                title="下一份"
                aria-label="下一份"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>

        <footer className="diary-book-footer">
          <button
            type="button"
            className="diary-book-refresh"
            onClick={() => setEntries(loadDiaryBook())}
            title="刷新列表"
          >
            <RotateCw className="h-4 w-4" />
            <span>刷新</span>
          </button>
          <span className="diary-book-hint">
            点击外部空白区域或右上角 ✕ 关闭手账本
          </span>
        </footer>
      </div>
    </div>
  );
};

export default MyDiaryBook;