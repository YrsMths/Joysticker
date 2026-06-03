import { useState } from 'react';
import { X, Plus, Trash2, Check, Pencil } from 'lucide-react';
import {
  Account,
  AVATAR_OPTIONS,
  AvatarStyle,
  createAccount,
  deleteAccount,
  getCurrentAccount,
  listAccounts,
  switchAccount,
  updateAccount,
} from '@/lib/account';

interface Props {
  onClose: () => void;
  onChanged: (next: Account) => void;
}

export default function AccountPanel({ onClose, onChanged }: Props){
  const [list,setList] = useState<Account[]>(listAccounts());
  const [current,setCurrent] = useState<Account>(getCurrentAccount());
  const [editing,setEditing] = useState<string|null>(null);
  const [draftName,setDraftName] = useState<string>('');
  const [creating,setCreating] = useState<boolean>(false);
  const [newName,setNewName] = useState<string>('');
  const [newEmoji,setNewEmoji] = useState<string>(AVATAR_OPTIONS.emojis[0]);
  const [newStyle,setNewStyle] = useState<AvatarStyle>(AVATAR_OPTIONS.styles[0]);

  const refresh = (next: Account) => {
    setList(listAccounts());
    setCurrent(next);
    onChanged(next);
  };

  const onPickEmoji = (acct: Account, emoji: string) => {
    const u = updateAccount(acct.id, { avatarEmoji: emoji });
    if(!u) return;
    setList(listAccounts());
    if(u.id === current.id){ setCurrent(u); onChanged(u); }
  };
  const onPickStyle = (acct: Account, style: AvatarStyle) => {
    const u = updateAccount(acct.id, { avatarStyle: style });
    if(!u) return;
    setList(listAccounts());
    if(u.id === current.id){ setCurrent(u); onChanged(u); }
  };
  const onSwitch = (id: string) => {
    const next = switchAccount(id);
    if(next) refresh(next);
  };
  const onSaveName = (id: string) => {
    const u = updateAccount(id, { name: draftName });
    setEditing(null);
    if(u){
      setList(listAccounts());
      if(u.id === current.id){ setCurrent(u); onChanged(u); }
    }
  };
  const onDelete = (id: string) => {
    if(!confirm('确认删除该账号？该账号下的进度、贴纸图鉴与手账本会一并清空。')) return;
    const next = deleteAccount(id);
    if(next) refresh(next);
  };
  const onCreate = () => {
    const acct = createAccount(newName.trim(), { avatarEmoji: newEmoji, avatarStyle: newStyle });
    setCreating(false);
    setNewName('');
    refresh(acct);
  };

  return <div className="account-mask" onClick={onClose}>
    <div className="account-modal" onClick={(e)=>e.stopPropagation()}>
      <div className="account-header">
        <h2>我的账号</h2>
        <p>不同账号的进度、贴纸图鉴和手账本互相隔离。</p>
        <button className="account-close" onClick={onClose} aria-label="关闭"><X className="h-4 w-4"/></button>
      </div>
      <div className="account-body">
        <div className="account-list">
          {list.map(acct=>{
            const isCur = acct.id === current.id;
            return <div key={acct.id} className={`account-card ${isCur?'is-current':''}`}>
              <div className={`account-card-avatar account-badge-${acct.avatarStyle}`}>
                <span aria-hidden="true">{acct.avatarEmoji}</span>
              </div>
              <div className="account-card-main">
                {editing===acct.id
                  ? <div className="account-card-name-edit">
                      <input
                        value={draftName}
                        onChange={(e)=>setDraftName(e.target.value.slice(0,12))}
                        autoFocus
                        placeholder="输入新名字"
                      />
                      <button className="account-icon-btn" onClick={()=>onSaveName(acct.id)} aria-label="保存"><Check className="h-4 w-4"/></button>
                    </div>
                  : <div className="account-card-name-row">
                      <strong>{acct.name}</strong>
                      <button className="account-icon-btn" onClick={()=>{ setEditing(acct.id); setDraftName(acct.name); }} aria-label="改名"><Pencil className="h-4 w-4"/></button>
                    </div>
                }
                <div className="account-card-emojis">
                  {AVATAR_OPTIONS.emojis.map(e=>(
                    <button key={e} className={`account-emoji ${acct.avatarEmoji===e?'active':''}`} onClick={()=>onPickEmoji(acct,e)}>{e}</button>
                  ))}
                </div>
                <div className="account-card-styles">
                  {AVATAR_OPTIONS.styles.map(s=>(
                    <button key={s} className={`account-style account-badge-${s} ${acct.avatarStyle===s?'active':''}`} onClick={()=>onPickStyle(acct,s)} aria-label={`选择 ${s}`}/>
                  ))}
                </div>
                <div className="account-card-actions">
                  {!isCur && <button className="account-btn" onClick={()=>onSwitch(acct.id)}>切换到此账号</button>}
                  {isCur && <span className="account-current-tag">当前使用</span>}
                  {list.length>1 && <button className="account-btn account-btn-danger" onClick={()=>onDelete(acct.id)}><Trash2 className="h-3.5 w-3.5"/>删除</button>}
                </div>
              </div>
            </div>;
          })}
        </div>

        <div className="account-create">
          {!creating
            ? <button className="account-btn account-btn-primary" onClick={()=>setCreating(true)}><Plus className="h-4 w-4"/>新建账号</button>
            : <div className="account-create-form">
                <div className="account-create-row">
                  <input
                    placeholder="账号昵称（最多12字）"
                    value={newName}
                    onChange={(e)=>setNewName(e.target.value.slice(0,12))}
                    autoFocus
                  />
                </div>
                <div className="account-create-row">
                  <span className="account-create-label">头像图案</span>
                  <div className="account-card-emojis">
                    {AVATAR_OPTIONS.emojis.map(e=>(
                      <button key={e} className={`account-emoji ${newEmoji===e?'active':''}`} onClick={()=>setNewEmoji(e)}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="account-create-row">
                  <span className="account-create-label">头像底色</span>
                  <div className="account-card-styles">
                    {AVATAR_OPTIONS.styles.map(s=>(
                      <button key={s} className={`account-style account-badge-${s} ${newStyle===s?'active':''}`} onClick={()=>setNewStyle(s)} aria-label={s}/>
                    ))}
                  </div>
                </div>
                <div className="account-create-actions">
                  <button className="account-btn" onClick={()=>setCreating(false)}>取消</button>
                  <button className="account-btn account-btn-primary" onClick={onCreate}><Check className="h-4 w-4"/>创建</button>
                </div>
              </div>
          }
        </div>
      </div>
    </div>
  </div>;
}