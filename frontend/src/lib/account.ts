// 本地账户系统：localStorage 数据按 accountId 隔离
// 存储结构：
//   acct.list.v1   -> Account[]            账号列表
//   acct.current.v1 -> string              当前账号 id
//   u.<accountId>.<key> -> any             该账号下的业务数据（progress / unlocks / diary.book / diary.title / diary.subtitle）
//
// 旧版本的 progress.v1 / unlocks.v1 / diary.book.v1 / diary.title.v1 / diary.subtitle.v1 等顶层 key
// 在初始化时会被自动迁移到默认 guest 账号下，并删除旧 key。

const LIST_KEY = 'acct.list.v1';
const CURRENT_KEY = 'acct.current.v1';
const PREFIX = 'u.';

export type AvatarStyle = 'cream' | 'pink' | 'mint' | 'gold' | 'blue' | 'brown';

export interface Account {
  id: string;
  name: string;
  avatarStyle: AvatarStyle;
  avatarEmoji: string;     // 圆形贴纸头像中显示的 emoji
  createdAt: number;
}

const AVATAR_EMOJIS = ['🐱','🐶','🐰','🦊','🐼','🐯','🐨','🐸','⭐','🌸','🍀','🍩','🎈','🍓','🌈','🦄'];
const AVATAR_STYLES: AvatarStyle[] = ['cream','pink','mint','gold','blue','brown'];

function uid(){ return 'a_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-3); }

function safeParse<T>(raw: string|null, fallback: T): T {
  if(!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function readList(): Account[] {
  return safeParse<Account[]>(localStorage.getItem(LIST_KEY), []);
}
function writeList(list: Account[]){
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

// 旧顶层 key 列表（来自之前版本）。迁移到默认 guest 账号。
const LEGACY_KEYS = [
  'happy-sticker-book-v7',     // 主进度（Index.tsx KEY）
  'sticker_collection_v1',     // 贴纸图鉴解锁（collection.ts COLLECTION_KEY）
  'diary.book.v1',             // 手账本快照（MyDiaryBook）
  'diary.title.v1',
  'diary.subtitle.v1',
];

function migrateLegacy(targetId: string){
  for(const k of LEGACY_KEYS){
    const v = localStorage.getItem(k);
    if(v == null) continue;
    const newKey = PREFIX + targetId + '.' + k;
    if(localStorage.getItem(newKey) == null){
      localStorage.setItem(newKey, v);
    }
    localStorage.removeItem(k);
  }
}

/** 初始化账户系统：若没有账号则创建一个默认 guest，并把旧顶层 key 迁移过去。 */
export function initAccounts(): Account {
  let list = readList();
  if(list.length === 0){
    const guest: Account = {
      id: uid(),
      name: '游客',
      avatarStyle: 'cream',
      avatarEmoji: '🐱',
      createdAt: Date.now(),
    };
    list = [guest];
    writeList(list);
    localStorage.setItem(CURRENT_KEY, guest.id);
    migrateLegacy(guest.id);
    return guest;
  }
  let curId = localStorage.getItem(CURRENT_KEY);
  if(!curId || !list.find(a=>a.id===curId)){
    curId = list[0].id;
    localStorage.setItem(CURRENT_KEY, curId);
  }
  return list.find(a=>a.id===curId)!;
}

export function listAccounts(): Account[] { return readList(); }

export function getCurrentAccount(): Account {
  return initAccounts();
}

export function getCurrentAccountId(): string {
  return getCurrentAccount().id;
}

export function switchAccount(id: string): Account | null {
  const list = readList();
  const acct = list.find(a=>a.id===id);
  if(!acct) return null;
  localStorage.setItem(CURRENT_KEY, id);
  return acct;
}

export function createAccount(name: string, opts?: Partial<Pick<Account,'avatarStyle'|'avatarEmoji'>>): Account {
  const list = readList();
  const acct: Account = {
    id: uid(),
    name: (name||'').trim() || `玩家${list.length+1}`,
    avatarStyle: opts?.avatarStyle || AVATAR_STYLES[list.length % AVATAR_STYLES.length],
    avatarEmoji: opts?.avatarEmoji || AVATAR_EMOJIS[list.length % AVATAR_EMOJIS.length],
    createdAt: Date.now(),
  };
  list.push(acct);
  writeList(list);
  localStorage.setItem(CURRENT_KEY, acct.id);
  return acct;
}

export function updateAccount(id: string, patch: Partial<Pick<Account,'name'|'avatarStyle'|'avatarEmoji'>>): Account | null {
  const list = readList();
  const i = list.findIndex(a=>a.id===id);
  if(i<0) return null;
  list[i] = { ...list[i], ...patch };
  writeList(list);
  return list[i];
}

export function deleteAccount(id: string): Account | null {
  let list = readList();
  if(list.length<=1) return null;
  // 同时清理该账号下所有 u.<id>.* 数据
  const dropPrefix = PREFIX + id + '.';
  const toRemove: string[] = [];
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(dropPrefix)) toRemove.push(k);
  }
  toRemove.forEach(k=>localStorage.removeItem(k));
  list = list.filter(a=>a.id!==id);
  writeList(list);
  const cur = localStorage.getItem(CURRENT_KEY);
  if(cur === id){
    localStorage.setItem(CURRENT_KEY, list[0].id);
  }
  return list[0];
}

/** 取得当前账号下某 key 的命名空间 key。 */
export function nsKey(key: string, accountId?: string): string {
  const id = accountId || getCurrentAccountId();
  return PREFIX + id + '.' + key;
}

export function getItem(key: string, accountId?: string): string | null {
  return localStorage.getItem(nsKey(key, accountId));
}
export function setItem(key: string, value: string, accountId?: string){
  localStorage.setItem(nsKey(key, accountId), value);
}
export function removeItem(key: string, accountId?: string){
  localStorage.removeItem(nsKey(key, accountId));
}

export const AVATAR_OPTIONS = {
  styles: AVATAR_STYLES,
  emojis: AVATAR_EMOJIS,
};