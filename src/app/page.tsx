'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Lock, Unlock, Key, Plus, Trash2, Copy, Check,
  ChevronRight, LogOut, User, Globe, Book, Terminal,
  Eye, EyeOff, RefreshCw, AlertTriangle, Zap, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================
interface UserSession {
  token: string;
  user: { id: string; email: string; name: string | null };
}

interface Channel {
  id: string;
  name: string;
  description: string | null;
  rounds: number;
  createdAt: string;
  _count: { encryptionLogs: number };
}

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsed: string | null;
  createdAt: string;
}

type View = 'register' | 'login' | 'verify' | 'dashboard';
type Tab = 'encrypt' | 'channels' | 'api-keys' | 'docs';

// ============================================================
// Main App
// ============================================================
export default function Home() {
  const [view, setView] = useState<View>('login');
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('encrypt');
  const [loading, setLoading] = useState(false);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [regToken, setRegToken] = useState('');

  // Dashboard state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [encryptInput, setEncryptInput] = useState('');
  const [encryptOutput, setEncryptOutput] = useState('');
  const [decryptInput, setDecryptInput] = useState('');
  const [decryptRounds, setDecryptRounds] = useState(4);
  const [decryptOutput, setDecryptOutput] = useState('');
  const [opLoading, setOpLoading] = useState(false);

  // New channel
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelRounds, setNewChannelRounds] = useState(4);
  const [showNewChannel, setShowNewChannel] = useState(false);

  // New API key
  const [newKeyName, setNewKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');

  const { toast } = useToast();

  // Restore session
  useEffect(() => {
    const stored = localStorage.getItem('qs_session');
    if (stored) {
      try {
        const s = JSON.parse(stored) as UserSession;
        setSession(s);
        setView('dashboard');
      } catch { /* ignore */ }
    }
  }, []);

  // Load data when entering dashboard
  const loadDashboard = useCallback(async () => {
    try {
      const [chRes, akRes] = await Promise.all([
        fetch('/api/channels', { headers: { Authorization: `Bearer ${session?.token}` } }),
        fetch('/api/api-keys', { headers: { Authorization: `Bearer ${session?.token}` } }),
      ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        setChannels(chData.channels || []);
      }
      if (akRes.ok) {
        const akData = await akRes.json();
        setApiKeys(akData.keys || []);
      }
    } catch (e) {
      console.error('Load dashboard error:', e);
    }
  }, [session?.token]);

  useEffect(() => {
    if (view === 'dashboard' && session) {
      loadDashboard();
    }
  }, [view, session, loadDashboard]);

  // ============================================================
  // Auth handlers
  // ============================================================
  const handleRegister = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error);
        return;
      }
      setRegToken(data.verificationToken);
      setView('verify');
      toast({ title: 'Код верификации', description: 'В демо-режиме код показан ниже. В продакшене — отправка на email.' });
    } catch {
      setAuthError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken || regToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error);
        return;
      }
      toast({ title: 'Email подтверждён!', description: 'Теперь можно войти.' });
      setView('login');
    } catch {
      setAuthError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error);
        return;
      }
      setSession({ token: data.token, user: data.user });
      localStorage.setItem('qs_session', JSON.stringify({ token: data.token, user: data.user }));
      setView('dashboard');
      toast({ title: 'Добро пожаловать!' });
    } catch {
      setAuthError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('qs_session');
    setView('login');
    setChannels([]);
    setApiKeys([]);
    setSelectedChannel(null);
  };

  // ============================================================
  // Channel handlers
  // ============================================================
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          name: newChannelName,
          description: newChannelDesc || null,
          rounds: newChannelRounds,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Ошибка', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Канал создан!', description: `"${newChannelName}" с ${newChannelRounds} раундами шифрования` });
      setNewChannelName('');
      setNewChannelDesc('');
      setShowNewChannel(false);
      loadDashboard();
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось создать канал', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    try {
      await fetch(`/api/channels?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      toast({ title: 'Канал удалён' });
      if (selectedChannel?.id === id) setSelectedChannel(null);
      loadDashboard();
    } catch {
      toast({ title: 'Ошибка удаления', variant: 'destructive' });
    }
  };

  // ============================================================
  // Encrypt / Decrypt
  // ============================================================
  const handleEncrypt = async () => {
    if (!selectedChannel || !encryptInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          data: encryptInput,
          channelId: selectedChannel.id,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Ошибка шифрования', description: data.error, variant: 'destructive' });
        return;
      }
      setEncryptOutput(data.encrypted);
      setDecryptInput(data.encrypted);
      setDecryptRounds(data.rounds);
      toast({ title: 'Зашифровано!', description: `${data.rounds} раундов через канал "${selectedChannel.name}"` });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось зашифровать', variant: 'destructive' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!selectedChannel || !decryptInput) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/decrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          encrypted: decryptInput,
          channelId: selectedChannel.id,
          rounds: decryptRounds,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Ошибка дешифровки', description: data.error, variant: 'destructive' });
        return;
      }
      setDecryptOutput(data.decrypted);
      toast({ title: 'Расшифровано!' });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось расшифровать', variant: 'destructive' });
    } finally {
      setOpLoading(false);
    }
  };

  // ============================================================
  // API Keys
  // ============================================================
  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Ошибка', description: data.error, variant: 'destructive' });
        return;
      }
      setCreatedApiKey(data.apiKey);
      setNewKeyName('');
      toast({ title: 'API-ключ создан!', description: 'Скопируйте его — он больше не будет показан' });
      loadDashboard();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    try {
      await fetch(`/api/api-keys?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      toast({ title: 'API-ключ удалён' });
      loadDashboard();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопировано!' });
  };

  // ============================================================
  // Render Auth Views
  // ============================================================
  const renderAuth = () => (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">QuantumShield</h1>
          <p className="text-muted-foreground mt-2">Квантово-устойчивое циклическое шифрование</p>
        </div>

        <Card className="border-border/50 backdrop-blur-sm bg-card/80">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {view === 'register' && 'Регистрация'}
              {view === 'login' && 'Вход в систему'}
              {view === 'verify' && 'Верификация email'}
            </CardTitle>
            <CardDescription>
              {view === 'register' && 'Создайте аккаунт для управления ключами шифрования'}
              {view === 'login' && 'Введите свои данные для доступа к дашборду'}
              {view === 'verify' && 'Введите код верификации для подтверждения email'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {authError}
              </div>
            )}

            {view === 'register' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Имя (необязательно)</label>
                  <Input
                    placeholder="Ваше имя"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Пароль (мин. 8 символов)</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleRegister} className="w-full" disabled={loading}>
                  {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Уже есть аккаунт?{' '}
                  <button onClick={() => { setView('login'); setAuthError(''); }} className="text-primary hover:underline">
                    Войти
                  </button>
                </p>
              </>
            )}

            {view === 'login' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Пароль</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleLogin} className="w-full" disabled={loading}>
                  {loading ? 'Вход...' : 'Войти'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Нет аккаунта?{' '}
                  <button onClick={() => { setView('register'); setAuthError(''); }} className="text-primary hover:underline">
                    Зарегистрироваться
                  </button>
                </p>
              </>
            )}

            {view === 'verify' && (
              <>
                {regToken && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm space-y-1">
                    <p className="font-medium text-primary">Демо-код верификации:</p>
                    <code className="text-xs break-all block font-mono">{regToken}</code>
                    <p className="text-muted-foreground text-xs mt-1">В продакшене этот код отправляется на email</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Код верификации</label>
                  <Input
                    placeholder="Вставьте код из email..."
                    value={verifyToken}
                    onChange={e => setVerifyToken(e.target.value)}
                  />
                </div>
                <Button onClick={handleVerify} className="w-full" disabled={loading}>
                  {loading ? 'Проверка...' : 'Подтвердить email'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> AES-256-GCM</span>
          <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Циклическое</span>
          <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Argon2id</span>
        </div>
      </motion.div>
    </div>
  );

  // ============================================================
  // Render Dashboard
  // ============================================================
  const renderDashboard = () => (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm sm:text-base">QuantumShield</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:flex items-center gap-1 text-xs">
              <User className="w-3 h-3" />
              {session?.user.email}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="encrypt" className="text-xs sm:text-sm">
              <Lock className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Шифрование
            </TabsTrigger>
            <TabsTrigger value="channels" className="text-xs sm:text-sm">
              <Layers className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Каналы
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="text-xs sm:text-sm">
              <Key className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              API-ключи
            </TabsTrigger>
            <TabsTrigger value="docs" className="text-xs sm:text-sm">
              <Book className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              API Docs
            </TabsTrigger>
          </TabsList>

          {/* ========== ENCRYPT TAB ========== */}
          <TabsContent value="encrypt" className="space-y-4">
            {/* Channel selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  Выберите канал шифрования
                </CardTitle>
                <CardDescription>
                  Каждый канал имеет уникальный ключ. Групповой чат — один ключ, чат с Ваней — другой.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {channels.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Нет каналов. Создайте первый на вкладке &quot;Каналы&quot;.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {channels.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedChannel(ch)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          selectedChannel?.id === ch.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="font-medium text-sm">{ch.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {ch.rounds} раундов · {ch._count.encryptionLogs} операций
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedChannel && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Encrypt */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" />
                      Шифровать
                    </CardTitle>
                    <CardDescription>
                      Канал: <span className="text-foreground font-medium">{selectedChannel.name}</span> · {selectedChannel.rounds} раундов
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <textarea
                      className="w-full min-h-[120px] p-3 rounded-lg bg-input border border-border text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Введите данные для шифрования..."
                      value={encryptInput}
                      onChange={e => setEncryptInput(e.target.value)}
                    />
                    <Button onClick={handleEncrypt} disabled={opLoading || !encryptInput} className="w-full">
                      {opLoading ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Шифрование...</>
                      ) : (
                        <><Lock className="w-4 h-4 mr-2" /> Зашифровать ({selectedChannel.rounds} раундов)</>
                      )}
                    </Button>
                    {encryptOutput && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Результат шифрования:</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(encryptOutput)} className="h-7 text-xs">
                            <Copy className="w-3 h-3 mr-1" /> Копировать
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs font-mono break-all max-h-32 overflow-y-auto">
                          {encryptOutput}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Decrypt */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Unlock className="w-4 h-4 text-primary" />
                      Дешифровать
                    </CardTitle>
                    <CardDescription>
                      Использует уникальный ключ канала &quot;{selectedChannel.name}&quot;
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Раунды шифрования</label>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        value={decryptRounds}
                        onChange={e => setDecryptRounds(parseInt(e.target.value) || 4)}
                      />
                    </div>
                    <textarea
                      className="w-full min-h-[80px] p-3 rounded-lg bg-input border border-border text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Вставьте зашифрованные данные..."
                      value={decryptInput}
                      onChange={e => setDecryptInput(e.target.value)}
                    />
                    <Button onClick={handleDecrypt} disabled={opLoading || !decryptInput} variant="outline" className="w-full">
                      {opLoading ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Дешифровка...</>
                      ) : (
                        <><Unlock className="w-4 h-4 mr-2" /> Расшифровать</>
                      )}
                    </Button>
                    {decryptOutput && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Расшифрованные данные:</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(decryptOutput)} className="h-7 text-xs">
                            <Copy className="w-3 h-3 mr-1" /> Копировать
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                          {decryptOutput}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Cyclic demo */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-primary" />
                  Как работает циклическое шифрование
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="px-3 py-1.5 rounded-lg bg-muted">Данные</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">Раунд 1 (Ключ A)</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">Раунд 2 (Ключ B)</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">Раунд 3 (Ключ C)</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">Раунд 4 (Ключ D)</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium">Шифртекст</div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Каждый раунд использует уникальный ключ, полученный через HKDF-SHA512 от мастер-ключа канала.
                  Даже одно и то же сообщение, зашифрованное дважды, даст абсолютно разный результат (благодаря случайным nonce/IV).
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== CHANNELS TAB ========== */}
          <TabsContent value="channels" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Каналы шифрования</h2>
                <p className="text-sm text-muted-foreground">Управляйте ключами шифрования для разных контекстов</p>
              </div>
              <Button onClick={() => setShowNewChannel(!showNewChannel)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> Новый канал
              </Button>
            </div>

            <AnimatePresence>
              {showNewChannel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="border-primary/20 mb-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Создать канал</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Название канала</label>
                          <Input
                            placeholder="Например: Чат с Ваней"
                            value={newChannelName}
                            onChange={e => setNewChannelName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Раунды шифрования</label>
                          <Input
                            type="number"
                            min={1}
                            max={32}
                            value={newChannelRounds}
                            onChange={e => setNewChannelRounds(parseInt(e.target.value) || 4)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Описание (необязательно)</label>
                        <Input
                          placeholder="Для чего этот канал..."
                          value={newChannelDesc}
                          onChange={e => setNewChannelDesc(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleCreateChannel} disabled={loading || !newChannelName.trim()}>
                          Создать
                        </Button>
                        <Button variant="ghost" onClick={() => setShowNewChannel(false)}>Отмена</Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {channels.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>У вас пока нет каналов</p>
                  <p className="text-xs mt-1">Создайте канал для начала шифрования</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {channels.map(ch => (
                  <Card key={ch.id} className="group hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm">{ch.name}</CardTitle>
                          {ch.description && (
                            <CardDescription className="text-xs mt-1">{ch.description}</CardDescription>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteChannel(ch.id)}
                          className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{ch.rounds} раундов</Badge>
                        <span>{ch._count.encryptionLogs} оп.</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Создан {new Date(ch.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ========== API KEYS TAB ========== */}
          <TabsContent value="api-keys" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">API-ключи</h2>
                <p className="text-sm text-muted-foreground">Используйте для встраивания шифрования в ваши проекты</p>
              </div>
            </div>

            {createdApiKey && (
              <Card className="border-primary/20">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Check className="w-4 h-4" />
                    Новый API-ключ создан! Сохраните его:
                  </div>
                  <div className="p-3 rounded-lg bg-muted font-mono text-xs break-all">{createdApiKey}</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => copyToClipboard(createdApiKey)}>
                      <Copy className="w-3 h-3 mr-1.5" /> Копировать ключ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreatedApiKey('')}>
                      Закрыть
                    </Button>
                  </div>
                  <p className="text-xs text-destructive">
                    Этот ключ больше не будет показан. Сохраните его сейчас!
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Создать новый ключ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Название ключа (например: Мой бот)"
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button onClick={handleCreateApiKey} disabled={!newKeyName.trim()}>
                    <Plus className="w-4 h-4 mr-1.5" /> Создать
                  </Button>
                </div>
              </CardContent>
            </Card>

            {apiKeys.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Нет API-ключей</p>
                  <p className="text-xs mt-1">Создайте ключ для доступа к API</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {apiKeys.map(k => (
                  <Card key={k.id} className="group">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Key className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{k.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{k.keyPrefix}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-muted-foreground hidden sm:block">
                          {k.lastUsed ? `Использован ${new Date(k.lastUsed).toLocaleDateString('ru-RU')}` : 'Никогда не использован'}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey(k.id)}
                          className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ========== DOCS TAB ========== */}
          <TabsContent value="docs" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                API Документация
              </h2>
              <p className="text-sm text-muted-foreground">
                Открытое API для встраивания шифрования в ваши проекты
              </p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Авторизация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Все API-запросы требуют авторизации через заголовок:</p>
                <div className="p-3 rounded-lg bg-muted font-mono text-xs">
                  X-API-Key: qs_XXXXXXXX_...
                </div>
                <p className="text-muted-foreground">API-ключи создаются на вкладке &quot;API-ключи&quot; в дашборде.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">POST</Badge>
                  <CardTitle className="text-base">/api/encrypt</CardTitle>
                </div>
                <CardDescription>Зашифровать данные для указанного канала</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <p className="font-medium">Headers:</p>
                  <div className="p-3 rounded-lg bg-muted font-mono text-xs space-y-1">
                    <div>Content-Type: application/json</div>
                    <div>X-API-Key: qs_XXXXXXXX_...</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Body:</p>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-xs overflow-x-auto">{`{
  "data": "Секретное сообщение",
  "channelId": "clxxxxx..."
}`}</pre>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Response:</p>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-xs overflow-x-auto">{`{
  "encrypted": "base64url-encoded-ciphertext...",
  "rounds": 4,
  "version": 1,
  "channelId": "clxxxxx..."
}`}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">POST</Badge>
                  <CardTitle className="text-base">/api/decrypt</CardTitle>
                </div>
                <CardDescription>Расшифровать данные для указанного канала</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <p className="font-medium">Body:</p>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-xs overflow-x-auto">{`{
  "encrypted": "base64url-encoded-ciphertext...",
  "channelId": "clxxxxx...",
  "rounds": 4
}`}</pre>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Response:</p>
                  <pre className="p-3 rounded-lg bg-muted font-mono text-xs overflow-x-auto">{`{
  "decrypted": "Секретное сообщение",
  "channelId": "clxxxxx..."
}`}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">GET</Badge>
                  <CardTitle className="text-base">/api/channels</CardTitle>
                </div>
                <CardDescription>Получить список каналов (требует JWT или API-ключ)</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <pre className="p-3 rounded-lg bg-muted font-mono text-xs overflow-x-auto">{`{
  "channels": [
    {
      "id": "clxxxxx...",
      "name": "Чат с Ваней",
      "rounds": 4,
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}`}</pre>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  О безопасности
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-muted-foreground">
                <p><strong className="text-foreground">Алгоритм:</strong> AES-256-GCM с циклическим многослойным шифрованием</p>
                <p><strong className="text-foreground">Деривация ключей:</strong> PBKDF2-SHA512 (200k итераций на канал, 100k на раунд)</p>
                <p><strong className="text-foreground">Хеширование паролей:</strong> Argon2id (64MB, memory-hard, квантово-устойчивый)</p>
                <p><strong className="text-foreground">Квантовая устойчивость:</strong> 256-битный AES при атаке Гровера сохраняет 128-битную защиту. Многослойное шифрование экспоненциально увеличивает стоимость атаки.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            QuantumShield · Квантово-устойчивое шифрование
          </span>
          <span className="flex items-center gap-3">
            <span>AES-256-GCM</span>
            <Separator orientation="vertical" className="h-3" />
            <span>Argon2id</span>
            <Separator orientation="vertical" className="h-3" />
            <span>Open API</span>
          </span>
        </div>
      </footer>
    </div>
  );

  // ============================================================
  // Main render
  // ============================================================
  return (
    <AnimatePresence mode="wait">
      {(view === 'dashboard' && session) ? renderDashboard() : renderAuth()}
    </AnimatePresence>
  );
}