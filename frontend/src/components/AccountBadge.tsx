import { useState } from 'react';
import { Account } from '@/game/state/account';
import AccountPanel from './AccountPanel';

interface Props {
  account: Account;
  onChanged: (next: Account) => void;
  /**
   * 额外的定位/尺寸 class，由父级传入。
   * 大圆贴纸默认尺寸由 .account-sticker 控制，
   * 父级可在外面包一个 absolute 容器来贴在标题左上角。
   */
  className?: string;
  /**
   * 贴纸尺寸预设：
   * - 'lg' (默认): 72px，用于 Home 大标题左外侧
   * - 'md': 56px，用于其他页面顶部品牌按钮左外侧
   */
  size?: 'lg' | 'md';
  /**
   * 是否可交互：
   * - true (默认): 点击可打开账号管理面板
   * - false: 不响应点击，仅保留 hover 视觉效果与 title tooltip
   */
  interactive?: boolean;
}

export default function AccountBadge({ account, onChanged, className, size = 'lg', interactive = true }: Props){
  const [open,setOpen] = useState(false);
  const sizeClass = size === 'md' ? 'account-sticker-md' : 'account-sticker-lg';
  const staticClass = interactive ? '' : ' account-sticker-static';
  const titleText = interactive
    ? `当前账号：${account.name}（点击切换/管理）`
    : `当前账号：${account.name}`;
  return <>
    <button
      type="button"
      className={`account-sticker ${sizeClass} account-badge-${account.avatarStyle}${staticClass}${className ? ` ${className}` : ''}`}
      onClick={interactive ? ()=>setOpen(true) : undefined}
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? 0 : -1}
      title={titleText}
      aria-label={interactive ? `当前账号：${account.name}，点击打开账号管理` : `当前账号：${account.name}`}
    >
      <span className="account-sticker-emoji" aria-hidden="true">{account.avatarEmoji}</span>
    </button>
    {open && <AccountPanel onClose={()=>setOpen(false)} onChanged={(next)=>{ onChanged(next); }}/>}
  </>;
}
