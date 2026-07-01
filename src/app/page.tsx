'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Lock, Unlock, Key, Plus, Trash2, Copy, LogOut,
  Terminal, Eye, EyeOff, Shield, Users, UserCheck,
  UserX, Search, Check, X, ChevronRight, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================
interface Session {
  token: string;
  user: { id: string; login: string; isVerified: boolean; isAdmin: boolean };
}
interface Chat {
  id: string; name: string; isGroup: boolean; createdAt: string;
  _count: { encryptionLogs: number; members: number };
  members: { id: string; login: string }[];
}
interface ApiKeyRec { id: string; name: string; keyPrefix: string; lastUsed: string | null; createdAt: string }
interface AdminUser {
  id: string; login: string; isVerified: boolean; isAdmin: boolean;
  createdAt: string; _count: { chats: number; apiKeys: number; encryptionLogs: number };
}
type View = 'auth' | 'app';
type Tab = 'encrypt' | 'chats' | 'keys' | 'admin' | 'docs';

// ============================================================
// Main
// ============================================================
export default function Home() {
  const [view, setView] = useState<View>('auth');
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('encrypt');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Auth
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');

  // Encrypt/Decrypt
  const [encInput, setEncInput] = useState('');
  const [encOutput, setEncOutput] = useState('');
  const [encChain, setEncChain] = useState<string[]>([]);
  const [decInput, setDecInput] = useState('');
  const [decChain, setDecChain] = useState<string[]>([]);
  const [decOutput, setDecOutput] = useState('');
  const [opLoading, setOpLoading] = useState(false);

  // Chats
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [newChatName, setNewChatName] = useState('');
  const [newChatMembers, setNewChatMembers] = useState<string[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; login: string }[]>([]);

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyRec[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState('');

  // Admin
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Rate limits
  const [dailyLeft, setDailyLeft] = useState(90000);
  const [monthlyLeft, setMonthlyLeft] = useState(200000);

  const headers = () => ({ Authorization: `Bearer ${session?.token}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    const s = localStorage.getItem('shifru');
    if (s) {
      try {
        const p = JSON.parse(s);
        setSession(p);
        setView('app');
      } catch { /* ignore */ }
    }
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [c, k, m] = await Promise.all([
        fetch('/api/channels', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
        fetch('/api/api-keys', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
        fetch('/api/me', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      ]);
      setChats(c.chats || []);
      setApiKeys(k.keys || []);
      if (m.user) {
        setSession(prev => prev ? { ...prev, user: { ...prev.user, isVerified: m.user.isVerified, isAdmin: m.user.isAdmin } } : null);
      }
      if (m.rateLimits) {
        setDailyLeft(m.rateLimits.dailyRemaining);
        setMonthlyLeft(m.rateLimits.monthlyRemaining);
      }
    } catch (e) { console.error(e); }
  }, [session]);

  useEffect(() => { if (view === 'app' && session) load(); }, [view, session, load]);

  const loadAdminUsers = useCallback(async () => {
    if (!session?.isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      setAdminUsers(data.users || []);
    } catch { /* ignore */ }
    setAdminLoading(false);
  }, [session]);

  useEffect(() => { if (tab === 'admin' && session?.isAdmin) loadAdminUsers(); }, [tab, session, loadAdminUsers]);

  // User search for chat members
  const searchUsers = useCallback(async (q: string) => {
    setUserSearch(q);
    if (q.length < 1 || !session) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch { setSearchResults([]); }
  }, [session]);

  const addMember = (id: string, login: string) => {
    if (newChatMembers.includes(id)) return;
    setNewChatMembers(prev => [...prev, id]);
    setSearchResults(prev => prev.filter(u => u.id !== id));
    setUserSearch('');
  };

  const removeMember = (id: string) => {
    setNewChatMembers(prev => prev.filter(m => m !== id));
  };

  // Auth
  const handleAuth = async () => {
    setLoading(true); setAuthError('');
    try {
      const url = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister ? { login, password, password2 } : { login, password };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      setSession({ token: data.token, user: data.user });
      localStorage.setItem('shifru', JSON.stringify({ token: data.token, user: data.user }));
      setView('app');
      toast({ title: isRegister ? 'Аккаунт создан — ожидайте верификацию' : 'Вход выполнен' });
    } catch { setAuthError('Ошибка соединения'); } finally { setLoading(false); }
  };

  // Encrypt
  const handleEncrypt = async () => {
    if (!selectedChat || !encInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/encrypt', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ data: encInput, chatId: selectedChat.id, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      setEncOutput(data.encrypted);
      setEncChain(data.chain);
      setDecInput(data.encrypted);
      setDecChain(data.chain);
      setDecOutput('');
      toast({ title: `Цепочка: ${data.chain.join(' → ')}` });
      load();
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); } finally { setOpLoading(false); }
  };

  // Decrypt
  const handleDecrypt = async () => {
    if (!selectedChat || !decInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/decrypt', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ encrypted: decInput, chatId: selectedChat.id, chain: decChain, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      setDecOutput(data.decrypted);
      toast({ title: 'Расшифровано' });
      load();
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); } finally { setOpLoading(false); }
  };

  // Chat CRUD
  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ name: newChatName, password, memberIds: newChatMembers }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      toast({ title: `Чат "${newChatName}" создан` });
      setNewChatName(''); setNewChatMembers([]); setShowNewChat(false);
      load();
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); } finally { setLoading(false); }
  };

  const handleDeleteChat = async (id: string) => {
    await fetch(`/api/channels?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.token}` } });
    toast({ title: 'Чат удалён' });
    if (selectedChat?.id === id) setSelectedChat(null);
    load();
  };

  // API keys
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetch('/api/api-keys', { method: 'POST', headers: headers(), body: JSON.stringify({ name: newKeyName }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', variant: 'destructive' }); return; }
      setCreatedKey(data.apiKey); setNewKeyName('');
      toast({ title: 'API-ключ создан — сохраните его!' });
      load();
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); }
  };

  const handleDeleteKey = async (id: string) => {
    await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.token}` } });
    load();
  };

  // Admin verify
  const handleVerify = async (userId: string, action: 'verify' | 'unverify') => {
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      toast({ title: data.message });
      loadAdminUsers();
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: 'Скопировано' }); };

  const handleLogout = () => {
    setSession(null); localStorage.removeItem('shifru'); setView('app');
    setTimeout(() => setView('auth'), 0);
    setChats([]); setApiKeys([]); setSelectedChat(null);
  };

  const isVerified = session?.user.isVerified ?? false;
  const isAdmin = session?.user.isAdmin ?? false;

  // ============================================================
  // AUTH VIEW
  // ============================================================
  if (view === 'auth') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-2 border-black mb-4">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Shifru</h1>
            <p className="text-xs text-neutral-500 mt-1">Цепочечное шифрование v2</p>
          </div>

          <Card className="border-black">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{isRegister ? 'Регистрация' : 'Вход'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {authError && <p className="text-xs text-red-600">{authError}</p>}

              {isRegister && (
                <div>
                  <label className="text-xs font-medium mb-1 block">Логин</label>
                  <Input placeholder="username" value={login} onChange={e => setLogin(e.target.value)} className="border-black" />
                </div>
              )}

              <div>
                <label className="text-xs font-medium mb-1 block">{isRegister ? 'Пароль' : 'Логин'}</label>
                <div className="relative">
                  <Input
                    type={isRegister ? (showPass ? 'text' : 'password') : 'text'}
                    placeholder={isRegister ? 'Минимум 6 символов' : 'username'}
                    value={isRegister ? password : login}
                    onChange={e => isRegister ? setPassword(e.target.value) : setLogin(e.target.value)}
                    className={isRegister ? 'pr-9 border-black' : 'border-black'}
                  />
                  {isRegister && (
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {isRegister && (
                <div>
                  <label className="text-xs font-medium mb-1 block">Повторите пароль</label>
                  <Input type="password" placeholder="Повторите пароль" value={password2} onChange={e => setPassword2(e.target.value)} className="border-black" />
                </div>
              )}

              <Button onClick={handleAuth}
                className="w-full bg-black text-white hover:bg-neutral-800"
                disabled={loading || (isRegister && (!login || !password || !password2)) || (!isRegister && (!login || !password))}>
                {loading ? '...' : (isRegister ? 'Создать аккаунт' : 'Войти')}
              </Button>

              <p className="text-center text-xs text-neutral-400">
                {isRegister ? 'Есть аккаунт?' : 'Нет аккаунта?'}
                {' '}
                <button onClick={() => { setIsRegister(!isRegister); setAuthError(''); }} className="underline text-black">
                  {isRegister ? 'Войти' : 'Зарегистрироваться'}
                </button>
              </p>
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-neutral-300 mt-6">Квантово-устойчивое цепочечное шифрование</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // APP VIEW
  // ============================================================
  const tabs: { key: Tab; label: string; icon: React.ReactNode; show?: boolean }[] = [
    { key: 'encrypt', label: 'Шифрование', icon: <Lock className="w-3.5 h-3.5" /> },
    { key: 'chats', label: 'Чаты', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'keys', label: 'API-ключи', icon: <Key className="w-3.5 h-3.5" /> },
    { key: 'admin', label: 'Админ', icon: <Shield className="w-3.5 h-3.5" />, show: isAdmin },
    { key: 'docs', label: 'Документация', icon: <Terminal className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-bold tracking-tight">Shifru</span>
            {!isVerified && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">ожидает верификации</Badge>
            )}
            {isAdmin && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-black">admin</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">{session?.user.login}</span>
            <button onClick={handleLogout} className="text-neutral-400 hover:text-black">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-neutral-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 flex gap-0">
          {tabs.filter(t => t.show !== false).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black'
              }`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* Not verified warning */}
        {!isVerified && tab !== 'admin' && (
          <div className="mb-4 p-3 border border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
            Ваш аккаунт ожидает верификации администратором. Шифрование и дешифровка будут доступны после подтверждения.
          </div>
        )}

        {/* ============ ENCRYPT TAB ============ */}
        {tab === 'encrypt' && (
          <div className="space-y-6">
            {/* Chat selector */}
            <div>
              <label className="text-xs font-medium mb-2 block">Чат / Канал</label>
              {chats.length === 0 ? (
                <p className="text-xs text-neutral-400">Нет чатов. Создайте чат во вкладке &quot;Чаты&quot;.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {chats.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedChat(c)}
                      className={`p-2.5 border text-left text-xs transition-colors ${
                        selectedChat?.id === c.id ? 'border-black bg-black text-white' : 'border-neutral-200 hover:border-black'
                      }`}>
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="opacity-60 mt-0.5 flex items-center gap-1">
                        <Users className="w-2.5 h-2.5" />
                        {c._count.members}
                        {c.isGroup && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">группа</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedChat && (
              <>
                <Separator />

                {/* Encrypt block */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-neutral-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Шифрование
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <textarea
                        value={encInput}
                        onChange={e => setEncInput(e.target.value)}
                        placeholder="Введите текст для шифрования..."
                        className="w-full h-24 p-2.5 text-xs border border-neutral-200 rounded resize-none focus:outline-none focus:border-black"
                      />
                      {encChain.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {encChain.map((m, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 border border-neutral-200 font-mono">{m}</span>
                          ))}
                        </div>
                      )}
                      <Button
                        onClick={handleEncrypt}
                        disabled={opLoading || !encInput || !isVerified}
                        size="sm"
                        className="w-full bg-black text-white hover:bg-neutral-800 text-xs"
                      >
                        {opLoading ? '...' : 'Зашифровать'}
                      </Button>
                      {encOutput && (
                        <div className="relative">
                          <textarea
                            value={encOutput}
                            readOnly
                            className="w-full h-16 p-2.5 text-[10px] font-mono border border-neutral-200 rounded bg-neutral-50 resize-none"
                          />
                          <button onClick={() => copy(encOutput)} className="absolute top-1.5 right-1.5 text-neutral-400 hover:text-black">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Decrypt block */}
                  <Card className="border-neutral-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5" /> Дешифровка
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <textarea
                        value={decInput}
                        onChange={e => { setDecInput(e.target.value); setDecChain([]); setDecOutput(''); }}
                        placeholder="Вставьте зашифрованные данные..."
                        className="w-full h-24 p-2.5 text-[10px] font-mono border border-neutral-200 rounded resize-none focus:outline-none focus:border-black"
                      />
                      {decChain.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {decChain.map((m, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 border border-neutral-200 font-mono">{m}</span>
                          ))}
                        </div>
                      )}
                      <Button
                        onClick={handleDecrypt}
                        disabled={opLoading || !decInput || !isVerified}
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                      >
                        {opLoading ? '...' : 'Дешифровать'}
                      </Button>
                      {decOutput && (
                        <div className="relative">
                          <textarea
                            value={decOutput}
                            readOnly
                            className="w-full h-16 p-2.5 text-xs border border-neutral-200 rounded bg-neutral-50 resize-none"
                          />
                          <button onClick={() => copy(decOutput)} className="absolute top-1.5 right-1.5 text-neutral-400 hover:text-black">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ CHATS TAB ============ */}
        {tab === 'chats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Чаты</h2>
              <Button onClick={() => setShowNewChat(!showNewChat)} size="sm" variant="outline" className="text-xs">
                <Plus className="w-3 h-3 mr-1" /> Новый чат
              </Button>
            </div>

            {showNewChat && (
              <Card className="border-neutral-200">
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Название чата</label>
                    <Input
                      value={newChatName}
                      onChange={e => setNewChatName(e.target.value)}
                      placeholder="например: Чат с Ваней"
                      className="border-neutral-200 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">Добавить участников</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
                      <Input
                        value={userSearch}
                        onChange={e => searchUsers(e.target.value)}
                        placeholder="Поиск по логину..."
                        className="border-neutral-200 text-xs pl-7"
                      />
                    </div>
                    {searchResults.length > 0 && (
                      <div className="border border-neutral-200 mt-1 max-h-32 overflow-y-auto">
                        {searchResults.map(u => (
                          <button
                            key={u.id}
                            onClick={() => addMember(u.id, u.login)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-50 border-b border-neutral-100 last:border-0 flex items-center justify-between"
                          >
                            <span>{u.login}</span>
                            <Plus className="w-3 h-3 text-neutral-400" />
                          </button>
                        ))}
                      </div>
                    )}
                    {newChatMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {newChatMembers.map(mid => {
                          const u = searchResults.find(r => r.id === mid);
                          return (
                            <Badge key={mid} variant="outline" className="text-[10px] gap-1">
                              {u?.login || mid}
                              <button onClick={() => removeMember(mid)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleCreateChat} disabled={loading || !newChatName.trim()} size="sm" className="bg-black text-white hover:bg-neutral-800 text-xs">
                    Создать
                  </Button>
                </CardContent>
              </Card>
            )}

            {chats.length === 0 ? (
              <p className="text-xs text-neutral-400 py-8 text-center">Нет чатов</p>
            ) : (
              <div className="space-y-2">
                {chats.map(c => (
                  <div key={c.id} className="border border-neutral-200 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium">{c.name}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {c.members.map(m => m.login).join(', ')}
                      </div>
                      <div className="text-[10px] text-neutral-300 mt-0.5">
                        {c._count.encryptionLogs} операций
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.isGroup ? (
                        <Badge variant="outline" className="text-[9px]">группа</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">личный</Badge>
                      )}
                      <button onClick={() => handleDeleteChat(c.id)} className="text-neutral-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ API KEYS TAB ============ */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">API-ключи</h2>
            </div>

            <Card className="border-neutral-200">
              <CardContent className="pt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Название ключа</label>
                  <Input
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    placeholder="например: Production"
                    className="border-neutral-200 text-xs"
                  />
                </div>
                <Button onClick={handleCreateKey} disabled={!newKeyName.trim()} size="sm" className="bg-black text-white hover:bg-neutral-800 text-xs">
                  Создать ключ
                </Button>
              </CardContent>
            </Card>

            {createdKey && (
              <Card className="border-black bg-neutral-50">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-[10px] text-neutral-500 font-medium">Сохраните этот ключ — он больше не будет показан</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] font-mono bg-white border border-neutral-200 p-2 rounded break-all">{createdKey}</code>
                    <button onClick={() => copy(createdKey)} className="text-neutral-400 hover:text-black">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {apiKeys.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Нет API-ключей</p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map(k => (
                  <div key={k.id} className="border border-neutral-200 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium">{k.name}</div>
                      <div className="text-[10px] font-mono text-neutral-400 mt-0.5">{k.keyPrefix}</div>
                      {k.lastUsed && (
                        <div className="text-[10px] text-neutral-300 mt-0.5">Последнее использование: {new Date(k.lastUsed).toLocaleDateString('ru')}</div>
                      )}
                    </div>
                    <button onClick={() => handleDeleteKey(k.id)} className="text-neutral-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ ADMIN TAB ============ */}
        {tab === 'admin' && isAdmin && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">Управление пользователями</h2>

            {adminLoading ? (
              <p className="text-xs text-neutral-400">Загрузка...</p>
            ) : adminUsers.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Нет пользователей</p>
            ) : (
              <div className="space-y-2">
                {adminUsers.map(u => (
                  <div key={u.id} className="border border-neutral-200 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        {u.login}
                        {u.isAdmin && <Badge variant="outline" className="text-[9px] px-1 py-0 border-black">admin</Badge>}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {new Date(u.createdAt).toLocaleDateString('ru')} · {u._count.chats} чатов · {u._count.encryptionLogs} операций
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {u.isVerified ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-7 px-2"
                          onClick={() => handleVerify(u.id, 'unverify')}
                          disabled={u.isAdmin}
                        >
                          <UserX className="w-3 h-3 mr-1" /> Снять
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="text-[10px] h-7 px-2 bg-black text-white hover:bg-neutral-800"
                          onClick={() => handleVerify(u.id, 'verify')}
                        >
                          <UserCheck className="w-3 h-3 mr-1" /> Верифицировать
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ DOCS TAB ============ */}
        {tab === 'docs' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold mb-2">API Documentation</h2>
              <p className="text-xs text-neutral-500">
                Shifru предоставляет REST API для шифрования и дешифровки данных.
                Каждый чат имеет уникальный ключ. Поддерживается авторизация через JWT-токены и API-ключи.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold mb-2">Цепочечное шифрование</h3>
              <p className="text-xs text-neutral-500 mb-2">
                Сообщение проходит через случайную цепочку преобразований:
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {['unicode', 'binary', 'decimal', 'TLS', 'SSL'].map(m => (
                  <Badge key={m} variant="outline" className="text-[10px] font-mono">{m}</Badge>
                ))}
              </div>
              <p className="text-xs text-neutral-500">
                Порядок этапов каждый раз случаен и может содержать от 5 до 10 шагов.
                Результат оборачивается в AES-256-GCM для квантовой устойчивости.
                Дешифратор знает порядок и выполняет обратные преобразования.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold mb-2">Лимиты запросов</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-neutral-200 p-3">
                  <div className="text-lg font-bold">{dailyLeft.toLocaleString('ru')}</div>
                  <div className="text-[10px] text-neutral-400">Осталось сегодня (из 90 000)</div>
                </div>
                <div className="border border-neutral-200 p-3">
                  <div className="text-lg font-bold">{monthlyLeft.toLocaleString('ru')}</div>
                  <div className="text-[10px] text-neutral-400">Осталось в этом месяце (из 200 000)</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold mb-2">Эндпоинты</h3>
              <div className="space-y-2">
                {[
                  { method: 'POST', path: '/api/auth/register', desc: 'Регистрация (login, password, password2)' },
                  { method: 'POST', path: '/api/auth/login', desc: 'Вход (login, password)' },
                  { method: 'POST', path: '/api/encrypt', desc: 'Шифрование (data, chatId, password)' },
                  { method: 'POST', path: '/api/decrypt', desc: 'Дешифровка (encrypted, chatId, chain, password)' },
                  { method: 'GET', path: '/api/channels', desc: 'Список чатов' },
                  { method: 'POST', path: '/api/channels', desc: 'Создать чат (name, password, memberIds[])' },
                  { method: 'GET', path: '/api/api-keys', desc: 'Список API-ключей' },
                  { method: 'POST', path: '/api/api-keys', desc: 'Создать API-ключ (name)' },
                  { method: 'GET', path: '/api/me', desc: 'Информация о профиле и лимитах' },
                ].map(ep => (
                  <div key={ep.path} className="border border-neutral-200 p-2 flex items-start gap-2">
                    <Badge variant="outline" className="text-[9px] font-mono shrink-0 mt-0.5">{ep.method}</Badge>
                    <div>
                      <code className="text-[10px] font-mono">{ep.path}</code>
                      <p className="text-[10px] text-neutral-400">{ep.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold mb-2">Использование через API-ключ</h3>
              <div className="bg-neutral-50 border border-neutral-200 p-3">
                <pre className="text-[10px] font-mono text-neutral-600 whitespace-pre-wrap">{`// Шифрование через API-ключ
fetch('/api/encrypt', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'shifru_XXXXX_YYYYY'
  },
  body: JSON.stringify({
    data: 'Привет!',
    chatId: 'chat_id_here'
  })
});

// Дешифровка через API-ключ
fetch('/api/decrypt', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'shifru_XXXXX_YYYYY'
  },
  body: JSON.stringify({
    encrypted: 'base64url_data...',
    chatId: 'chat_id_here',
    chain: ['unicode', 'binary', 'tls', ...]
  })
});`}</pre>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold mb-2">Безопасность</h3>
              <ul className="text-xs text-neutral-500 space-y-1">
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> AES-256-GCM внешний слой — квантовая устойчивость (Grover: 256 → 128 бит)</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> scrypt для хеширования паролей (memory-hard, N=16384)</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> PBKDF2-SHA512 для деривации ключей (600 000 итераций)</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> Пароли шифруются через собственный сервис перед хешированием</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> Уникальный ключ шифрования для каждого чата</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> Случайный порядок цепочки при каждом шифровании (5–10 этапов)</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-[10px] text-neutral-300">Shifru v2</span>
          <span className="text-[10px] text-neutral-300">chain encryption</span>
        </div>
      </footer>
    </div>
  );
}