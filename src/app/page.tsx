'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Lock, Unlock, Key, Plus, Trash2, Copy, LogOut,
  Terminal, Eye, EyeOff, ChevronRight, ArrowRight,
  Shield, Zap, Hash, Activity
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
interface Session { token: string; user: { id: string; login: string } }
interface Chat { id: string; name: string; createdAt: string; _count: { encryptionLogs: number } }
interface ApiKeyRec { id: string; name: string; keyPrefix: string; lastUsed: string | null; createdAt: string }
type View = 'auth' | 'app';
type Tab = 'encrypt' | 'chats' | 'keys' | 'docs' | 'info';

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
  const [authError, setAuthError] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Encrypt/Decrypt
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [encInput, setEncInput] = useState('');
  const [encOutput, setEncOutput] = useState('');
  const [encChain, setEncChain] = useState<string[]>([]);
  const [decInput, setDecInput] = useState('');
  const [decChain, setDecChain] = useState<string[]>([]);
  const [decOutput, setDecOutput] = useState('');
  const [opLoading, setOpLoading] = useState(false);

  // Chats
  const [newChatName, setNewChatName] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyRec[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState('');

  // Rate limits
  const [dailyLeft, setDailyLeft] = useState(90000);
  const [monthlyLeft, setMonthlyLeft] = useState(200000);

  const headers = () => ({ Authorization: `Bearer ${session?.token}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    const s = localStorage.getItem('qs2');
    if (s) { try { const p = JSON.parse(s); setSession(p); setView('app'); } catch {} }
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
      if (m.rateLimits) { setDailyLeft(m.rateLimits.dailyRemaining); setMonthlyLeft(m.rateLimits.monthlyRemaining); }
    } catch (e) { console.error(e); }
  }, [session]);

  useEffect(() => { if (view === 'app' && session) load(); }, [view, session, load]);

  // Auth
  const handleAuth = async () => {
    setLoading(true); setAuthError('');
    try {
      const url = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister ? { login, password } : { login, password };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      setSession({ token: data.token, user: data.user });
      localStorage.setItem('qs2', JSON.stringify({ token: data.token, user: data.user }));
      setView('app');
      toast({ title: isRegister ? 'Аккаунт создан' : 'Вход выполнен' });
    } catch { setAuthError('Ошибка соединения'); } finally { setLoading(false); }
  };

  // Encrypt
  const handleEncrypt = async () => {
    if (!selectedChat || !encInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/encrypt', { method: 'POST', headers: headers(), body: JSON.stringify({ data: encInput, chatId: selectedChat.id, password }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      setEncOutput(data.encrypted);
      setEncChain(data.chain);
      setDecInput(data.encrypted);
      setDecChain(data.chain);
      setDecOutput('');
      toast({ title: `Зашифровано · цепочка: ${data.chain.join(' → ')}` });
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); } finally { setOpLoading(false); }
  };

  // Decrypt
  const handleDecrypt = async () => {
    if (!selectedChat || !decInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/decrypt', { method: 'POST', headers: headers(), body: JSON.stringify({ encrypted: decInput, chatId: selectedChat.id, chain: decChain, password }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      setDecOutput(data.decrypted);
      toast({ title: 'Расшифровано' });
    } catch { toast({ title: 'Ошибка', variant: 'destructive' }); } finally { setOpLoading(false); }
  };

  // Chat CRUD
  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/channels', { method: 'POST', headers: headers(), body: JSON.stringify({ name: newChatName, password }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Ошибка', description: data.error, variant: 'destructive' }); return; }
      toast({ title: `Чат "${newChatName}" создан` });
      setNewChatName(''); setShowNewChat(false); load();
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

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: 'Скопировано' }); };

  const handleLogout = () => { setSession(null); localStorage.removeItem('qs2'); setView('auth'); setChats([]); setApiKeys([]); setSelectedChat(null); };

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
            <h1 className="text-xl font-bold tracking-tight">QuantumShield</h1>
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
                    placeholder={isRegister ? '••••••' : 'username'}
                    value={isRegister ? password : login}
                    onChange={e => isRegister ? setPassword(e.target.value) : setLogin(e.target.value)}
                    className={isRegister ? 'pr-9 border-black' : 'border-black'}
                  />
                  {isRegister && (
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {isRegister && (
                <div>
                  <label className="text-xs font-medium mb-1 block">Повторите пароль</label>
                  <Input type="password" placeholder="••••••" value={password2} onChange={e => setPassword2(e.target.value)} className="border-black" />
                </div>
              )}

              <Button onClick={() => {
                if (isRegister && password !== password2) { setAuthError('Пароли не совпадают'); return; }
                handleAuth();
              }} className="w-full bg-black text-white hover:bg-neutral-800" disabled={loading || (isRegister && (!login || !password || !password2)) || (!isRegister && (!login || !password))}>
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

          <div className="flex items-center justify-center gap-3 mt-6 text-[10px] text-neutral-400">
            <span>AES-256</span>
            <span>·</span>
            <span>Argon2id</span>
            <span>·</span>
            <span>Chain</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // APP VIEW
  // ============================================================
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'encrypt', label: 'Шифрование', icon: <Lock className="w-3.5 h-3.5" /> },
    { key: 'chats', label: 'Чаты', icon: <Hash className="w-3.5 h-3.5" /> },
    { key: 'keys', label: 'API', icon: <Key className="w-3.5 h-3.5" /> },
    { key: 'docs', label: 'Документация', icon: <Terminal className="w-3.5 h-3.5" /> },
    { key: 'info', label: 'Инфо', icon: <Activity className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-black sticky top-0 bg-white z-50">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-bold tracking-tight">QS</span>
            <span className="text-xs text-neutral-400 font-mono">{session?.user.login}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-neutral-400">
            <span>день: {dailyLeft.toLocaleString()}</span>
            <span className="text-neutral-300">|</span>
            <span>мес: {monthlyLeft.toLocaleString()}</span>
            <button onClick={handleLogout} className="ml-2 p-1 hover:bg-neutral-100 rounded"><LogOut className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-black">
        <div className="max-w-5xl mx-auto px-4 flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* ===== ENCRYPT TAB ===== */}
        {tab === 'encrypt' && (
          <div className="space-y-4">
            {/* Chat selector */}
            <div>
              <p className="text-xs font-medium mb-2">ЧАТ</p>
              {chats.length === 0 ? (
                <p className="text-xs text-neutral-400 py-6 border border-dashed border-neutral-300 text-center">Нет чатов. Создайте на вкладке &quot;Чаты&quot;.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {chats.map(ch => (
                    <button key={ch.id} onClick={() => setSelectedChat(ch)}
                      className={`px-2.5 py-1.5 text-xs border transition-colors ${selectedChat?.id === ch.id ? 'border-black bg-black text-white' : 'border-neutral-300 hover:border-black'}`}>
                      {ch.name}
                      <span className="text-neutral-400 ml-1">{ch._count.encryptionLogs}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedChat && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Encrypt */}
                <div>
                  <p className="text-xs font-medium mb-1.5">ШИФРОВАТЬ <span className="text-neutral-400">→ {selectedChat.name}</span></p>
                  <textarea
                    className="w-full min-h-[100px] p-2.5 border border-neutral-300 text-xs font-mono resize-y focus:outline-none focus:border-black bg-white"
                    placeholder="Данные..."
                    value={encInput}
                    onChange={e => setEncInput(e.target.value)}
                  />
                  <Button onClick={handleEncrypt} disabled={opLoading || !encInput} size="sm" className="w-full mt-2 bg-black text-white hover:bg-neutral-800">
                    {opLoading ? '...' : <><Lock className="w-3 h-3 mr-1" /> Шифровать</>}
                  </Button>
                  {encOutput && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-400">ЦЕПОЧКА: {encChain.join(' → ')}</span>
                        <button onClick={() => copy(encOutput)} className="text-[10px] text-neutral-400 hover:text-black"><Copy className="w-3 h-3" /></button>
                      </div>
                      <div className="p-2 border border-neutral-200 text-[10px] font-mono break-all max-h-24 overflow-y-auto bg-neutral-50">{encOutput}</div>
                    </div>
                  )}
                </div>

                {/* Decrypt */}
                <div>
                  <p className="text-xs font-medium mb-1.5">ДЕШИФРОВАТЬ <span className="text-neutral-400">→ {selectedChat.name}</span></p>
                  <textarea
                    className="w-full min-h-[100px] p-2.5 border border-neutral-300 text-xs font-mono resize-y focus:outline-none focus:border-black bg-white"
                    placeholder="Шифртекст..."
                    value={decInput}
                    onChange={e => { setDecInput(e.target.value); setDecChain([]); }}
                  />
                  <textarea
                    className="w-full min-h-[30px] p-2 border border-neutral-300 text-[10px] font-mono resize-y focus:outline-none focus:border-black bg-white mt-1"
                    placeholder='Цепочка: ["ssl","tls","binary"]'
                    value={decChain.length > 0 ? JSON.stringify(decChain) : ''}
                    onChange={e => { try { setDecChain(JSON.parse(e.target.value)); } catch {} }}
                  />
                  <Button onClick={handleDecrypt} disabled={opLoading || !decInput || decChain.length === 0} variant="outline" size="sm" className="w-full mt-1">
                    {opLoading ? '...' : <><Unlock className="w-3 h-3 mr-1" /> Дешифровать</>}
                  </Button>
                  {decOutput && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-neutral-400">РЕЗУЛЬТАТ</span>
                        <button onClick={() => copy(decOutput)} className="text-[10px] text-neutral-400 hover:text-black"><Copy className="w-3 h-3" /></button>
                      </div>
                      <div className="p-2.5 border border-black text-xs bg-white">{decOutput}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chain diagram */}
            <div className="border border-neutral-200 p-3 mt-4">
              <p className="text-[10px] font-medium mb-2">КАЖДОЕ ШИФРОВАНИЕ — УНИКАЛЬНАЯ ЦЕПОЧКА</p>
              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">данные</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">unicode</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">binary</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">decimal</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">TLS</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300">SSL</span>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <span className="px-2 py-0.5 bg-black text-white">AES-256-GCM</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-2">Порядок методов рандомный. Методы могут повторяться. Дешифратор знает порядок.</p>
            </div>
          </div>
        )}

        {/* ===== CHATS TAB ===== */}
        {tab === 'chats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">ЧАТЫ</p>
              <Button onClick={() => setShowNewChat(!showNewChat)} variant="outline" size="sm" className="border-black">
                <Plus className="w-3 h-3 mr-1" /> Новый
              </Button>
            </div>

            {showNewChat && (
              <div className="border border-black p-3 flex gap-2">
                <Input placeholder="Чат с Ваней" value={newChatName} onChange={e => setNewChatName(e.target.value)} className="border-black text-xs" />
                <Button onClick={handleCreateChat} disabled={!newChatName.trim()} size="sm" className="bg-black text-white">OK</Button>
                <Button onClick={() => setShowNewChat(false)} variant="ghost" size="sm">Отмена</Button>
              </div>
            )}

            {chats.length === 0 ? (
              <p className="text-xs text-neutral-400 py-8 text-center border border-dashed border-neutral-300">Нет чатов</p>
            ) : (
              <div className="space-y-1">
                {chats.map(ch => (
                  <div key={ch.id} className="flex items-center justify-between p-2.5 border border-neutral-200 hover:border-black transition-colors group">
                    <div>
                      <span className="text-xs font-medium">{ch.name}</span>
                      <span className="text-[10px] text-neutral-400 ml-2">{ch._count.encryptionLogs} оп.</span>
                    </div>
                    <button onClick={() => handleDeleteChat(ch.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-100">
                      <Trash2 className="w-3 h-3 text-neutral-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== API KEYS TAB ===== */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <p className="text-xs font-medium">API-КЛЮЧИ</p>

            {createdKey && (
              <div className="border-2 border-black p-3">
                <p className="text-[10px] font-medium mb-1">СОХРАНИТЕ КЛЮЧ — БОЛЬШЕ НЕ ПОКАЖЕТСЯ</p>
                <div className="p-2 bg-neutral-50 font-mono text-[10px] break-all">{createdKey}</div>
                <Button size="sm" variant="outline" onClick={() => { copy(createdKey); setCreatedKey(''); }} className="mt-2 border-black text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Копировать и закрыть
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Input placeholder="Название ключа" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} className="border-black text-xs max-w-xs" />
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim()} size="sm" className="bg-black text-white">
                <Plus className="w-3 h-3 mr-1" /> Создать
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center border border-dashed border-neutral-300">Нет ключей</p>
            ) : (
              <div className="space-y-1">
                {apiKeys.map(k => (
                  <div key={k.id} className="flex items-center justify-between p-2.5 border border-neutral-200 group">
                    <div className="flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      <div>
                        <span className="text-xs">{k.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono ml-2">{k.keyPrefix}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteKey(k.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-100">
                      <Trash2 className="w-3 h-3 text-neutral-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== DOCS TAB ===== */}
        {tab === 'docs' && (
          <div className="space-y-4 max-w-2xl">
            <p className="text-xs font-medium">API ДОКУМЕНТАЦИЯ</p>

            {[
              { method: 'POST', path: '/api/encrypt', desc: 'Зашифровать', body: '{\n  "data": "Секретное сообщение",\n  "chatId": "clxxxxx..."\n}', response: '{\n  "encrypted": "base64url...",\n  "chain": ["ssl","tls","binary"],\n  "version": 2\n}' },
              { method: 'POST', path: '/api/decrypt', desc: 'Дешифровать', body: '{\n  "encrypted": "base64url...",\n  "chatId": "clxxxxx...",\n  "chain": ["ssl","tls","binary"]\n}', response: '{\n  "decrypted": "Секретное сообщение"\n}' },
              { method: 'GET', path: '/api/channels', desc: 'Список чатов', body: null, response: '{\n  "chats": [{ "id": "...", "name": "..." }]\n}' },
            ].map(api => (
              <div key={api.path} className="border border-neutral-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] font-mono border-black">{api.method}</Badge>
                  <span className="text-xs font-mono font-medium">{api.path}</span>
                  <span className="text-[10px] text-neutral-400">{api.desc}</span>
                </div>
                <p className="text-[10px] text-neutral-400 mb-1">Header: X-API-Key: qs_XXXXXXXX_...</p>
                {api.body && (
                  <>
                    <p className="text-[10px] font-medium mt-2">Body:</p>
                    <pre className="text-[10px] font-mono p-2 bg-neutral-50 border border-neutral-200 mt-1">{api.body}</pre>
                  </>
                )}
                <p className="text-[10px] font-medium mt-2">Response:</p>
                <pre className="text-[10px] font-mono p-2 bg-neutral-50 border border-neutral-200 mt-1">{api.response}</pre>
              </div>
            ))}
          </div>
        )}

        {/* ===== INFO TAB ===== */}
        {tab === 'info' && (
          <div className="space-y-3 max-w-xl">
            <p className="text-xs font-medium">О ШИФРОВАНИИ</p>

            {[
              { label: 'Метод', value: 'Цепочечное: unicode → binary → decimal → TLS → SSL (рандомный порядок)' },
              { label: 'Внешний слой', value: 'AES-256-GCM (квантовая устойчивость)' },
              { label: 'Деривация ключей', value: 'PBKDF2-SHA512 (600k пароль, 100k AES, 50k на метод цепочки)' },
              { label: 'Хеширование паролей', value: 'Argon2id (64MB, memory-hard) — пароль шифруется через сервис' },
              { label: 'Длина цепочки', value: '5-10 методов (рандомная)' },
              { label: 'Лимиты', value: '90 000 / день, 200 000 / месяц' },
              { label: 'Квантовая устойчивость', value: 'AES-256 при Гровере = 128 бит + Argon2id memory-hard + структурная сложность цепочки' },
            ].map(item => (
              <div key={item.label} className="border-b border-neutral-100 pb-2">
                <span className="text-[10px] text-neutral-400">{item.label}</span>
                <p className="text-xs">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-200 py-3">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-[10px] text-neutral-400">
          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> QuantumShield v2</span>
          <span>AES-256 · Argon2id · Chain</span>
        </div>
      </footer>
    </div>
  );
}