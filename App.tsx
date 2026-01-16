import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Building2, 
  Tags, 
  CalendarDays, 
  CalendarCheck, 
  Plus, 
  Trash2, 
  RotateCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldAlert,
  LogOut,
  Search,
  Lock,
  LayoutDashboard,
  Settings,
  UserCheck,
  User,
  Key,
  ExternalLink,
  Info,
  Trash,
  Database,
  Code,
  KeyRound
} from 'lucide-react';
import { Category, Employee, Environment, SpecialDay, ScheduleEntry, AppState } from './types';
import { generateScheduleWithAI } from './geminiService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    // Fixed: Made optional to match existing ambient declarations and avoid "identical modifiers" error.
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'setup' | 'calendar' | 'employees'>('dashboard');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [state, setState] = useState<AppState>({
    categories: [],
    employees: [],
    environments: [],
    specialDays: [],
    schedules: {}
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    const localSess = localStorage.getItem('escala_session');
    if (localSess) {
      setSession(JSON.parse(localSess));
    }

    supabase.auth.getSession().then(({ data: { session: sbSession } }) => {
      if (sbSession) setSession(sbSession);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (sbSession) setSession(sbSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && isSupabaseConfigured) {
      loadInitialData();
    }
  }, [session]);

  // Added: Initial check for API key presence as per guidelines
  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          setApiError(true);
        }
      }
    };
    checkApiKey();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, emps, envs, days, schs] = await Promise.all([
        supabase.from('categories_escala').select('*').order('name'),
        supabase.from('employees').select('*').order('name'),
        supabase.from('environments').select('*').order('name'),
        supabase.from('special_days').select('*').order('date'),
        supabase.from('schedules').select('*')
      ]);

      if (cats.error) throw cats.error;
      if (emps.error) throw emps.error;
      if (envs.error) throw envs.error;
      if (days.error) throw days.error;
      if (schs.error) throw schs.error;

      const schedulesByMonth: Record<string, ScheduleEntry[]> = {};
      schs.data?.forEach((s: any) => {
        if (!schedulesByMonth[s.month_key]) schedulesByMonth[s.month_key] = [];
        schedulesByMonth[s.month_key].push({
          date: s.date,
          employeeId: s.employee_id,
          environmentId: s.environment_id,
          categoryId: s.category_id
        });
      });

      setState({
        categories: cats.data || [],
        employees: (emps.data || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          categoryId: e.category_id,
          active: e.active,
          isRestricted: e.is_restricted
        })),
        environments: envs.data || [],
        specialDays: days.data || [],
        schedules: schedulesByMonth
      });
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSupabaseError = (err: any) => {
    if (err.message?.includes('row-level security')) {
      return "ERRO DE PERMISSÃO: O Supabase bloqueou a gravação. Você precisa desativar o RLS ou criar políticas de acesso para as tabelas.";
    }
    return err.message || "Erro inesperado no banco de dados.";
  };

  const handleLogout = async () => {
    localStorage.removeItem('escala_session');
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleSelectApiKey = async () => {
    try {
      // Fixed: Safe access using optional chaining
      await window.aistudio?.openSelectKey();
      setApiError(false);
      setError(null);
    } catch (e) {
      console.error("Erro ao abrir seletor de chave:", e);
    }
  };

  const handleGenerateSchedule = async () => {
    if (state.employees.length === 0 || state.environments.length === 0) {
      setError("Cadastre a equipe e os ambientes nas configurações primeiro.");
      return;
    }

    const currentMonthDays = state.specialDays.filter((d: SpecialDay) => d.date.startsWith(currentMonth));
    if (currentMonthDays.length === 0) {
      setError("Nenhum Domingo ou Feriado cadastrado para este mês.");
      return;
    }

    setLoading(true);
    setError(null);
    setApiError(false);

    try {
      const entries = await generateScheduleWithAI(
        currentMonth,
        state.categories,
        state.employees,
        state.environments,
        state.specialDays
      );
      
      if (!entries || entries.length === 0) {
        throw new Error("A IA não retornou entradas válidas.");
      }

      await supabase.from('schedules').delete().eq('month_key', currentMonth);

      const dbEntries = entries.map(e => ({
        date: e.date,
        employee_id: e.employeeId,
        environment_id: e.environmentId,
        category_id: e.categoryId,
        month_key: currentMonth
      }));

      const { error: insertError } = await supabase.from('schedules').insert(dbEntries);
      if (insertError) throw insertError;

      setState(prev => ({
        ...prev,
        schedules: { ...prev.schedules, [currentMonth]: entries }
      }));
      
      alert("Escala gerada com sucesso!");
    } catch (err: any) {
      const msg = err.message || "";
      // Improved: Handling "Requested entity was not found" and other key errors as per guidelines
      if (msg.includes('403') || msg.includes('API key') || msg.includes('leaked') || msg.includes('PERMISSION_DENIED') || msg.includes('Requested entity was not found')) {
        setApiError(true);
        setError("Erro na API Gemini: Sua chave de API atual expirou ou foi bloqueada. Você precisa configurar uma chave pessoal.");
      } else {
        setError(handleSupabaseError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const swapEmployee = async (date: string, oldEmpId: string, newEmpId: string) => {
    setState(prev => {
      const monthSchedules = [...(prev.schedules[currentMonth] || [])];
      const index = monthSchedules.findIndex(s => s.date === date && s.employeeId === oldEmpId);
      if (index > -1) {
        monthSchedules[index] = { ...monthSchedules[index], employeeId: newEmpId };
      }
      return { ...prev, schedules: { ...prev.schedules, [currentMonth]: monthSchedules } };
    });

    const { error } = await supabase.from('schedules')
      .update({ employee_id: newEmpId })
      .match({ date, employee_id: oldEmpId, month_key: currentMonth });
    
    if (error) setError(handleSupabaseError(error));
  };

  const resetDatabase = async () => {
    if (!confirm("AVISO CRÍTICO: Isto apagará TODOS os dados. Deseja continuar?")) return;
    setLoading(true);
    try {
      await supabase.from('schedules').delete().neq('month_key', 'trash');
      await supabase.from('special_days').delete().neq('name', 'trash');
      await supabase.from('employees').delete().neq('name', 'trash');
      await supabase.from('environments').delete().neq('name', 'trash');
      await supabase.from('categories_escala').delete().neq('name', 'trash');

      setState({
        categories: [],
        employees: [],
        environments: [],
        specialDays: [],
        schedules: {}
      });
      alert("Base de dados limpa!");
    } catch (err: any) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!session) return <Login setSession={setSession} />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#020617] text-slate-100">
      <aside className="w-full md:w-72 bg-[#0f172a] text-white flex flex-col shrink-0 z-20 border-r border-slate-800">
        <div className="p-8 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/30">
            <CalendarCheck size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">App Escala</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão Inteligente</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-4">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Início" />
          <NavItem active={activeTab === 'setup'} onClick={() => setActiveTab('setup')} icon={<Settings size={20} />} label="Configurações" />
          <NavItem active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarDays size={20} />} label="Escala Mensal" />
          <NavItem active={activeTab === 'employees'} onClick={() => setActiveTab('employees')} icon={<Users size={20} />} label="Equipe" />
        </nav>

        <div className="p-6 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all font-semibold group">
            <LogOut size={18} /> 
            <span>Sair do sistema</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 md:p-10 lg:p-12 relative bg-[#020617]">
        {loading && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center">
            <div className="bg-slate-900 p-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 border border-slate-800">
              <div className="w-16 h-16 border-4 border-slate-800 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="font-black text-xl text-slate-50">Processando...</p>
                <p className="text-slate-400 text-sm mt-1 font-medium">Aguarde a resposta da Inteligência Artificial.</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'dashboard' && (
            <Dashboard 
              state={state} 
              onGenerate={handleGenerateSchedule} 
              loading={loading} 
              error={error} 
              apiError={apiError}
              onSelectKey={handleSelectApiKey}
            />
          )}
          {activeTab === 'setup' && (
            <Setup 
              state={state} 
              loadData={loadInitialData} 
              onReset={resetDatabase} 
              error={error} 
              onSelectKey={handleSelectApiKey}
            />
          )}
          {activeTab === 'calendar' && (
            <CalendarView 
              state={state} 
              currentMonth={currentMonth} 
              onMonthChange={(off: number) => {
                const [y, m] = currentMonth.split('-').map(Number);
                const d = new Date(y, m - 1 + off, 1);
                setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }}
              onSwap={swapEmployee}
              onGenerate={handleGenerateSchedule}
              loading={loading}
              error={error}
            />
          )}
          {activeTab === 'employees' && <EmployeesList state={state} />}
        </div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-semibold ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 active:scale-95' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
    {icon} <span>{label}</span>
  </button>
);

const Login: React.FC<{ setSession: (s: any) => void }> = ({ setSession }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const normalizedUser = username.trim().toLowerCase();
    const normalizedPass = password.trim();

    const isValidUser = normalizedUser === 'admin' || normalizedUser === 'escala@gmail.com';
    const isValidPass = (normalizedUser === 'admin' && normalizedPass === 'tododia') || 
                        (normalizedUser === 'escala@gmail.com' && (normalizedPass === 'escala@gmail.com' || normalizedPass === 'tododia'));

    if (isValidUser && isValidPass) {
      const mockSession = { user: { email: normalizedUser, id: 'local-admin' } };
      localStorage.setItem('escala_session', JSON.stringify(mockSession));
      setSession(mockSession);
    } else {
      setError("Credenciais incorretas.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-6">
      <div className="w-full max-w-md bg-slate-900 p-10 md:p-12 rounded-[40px] shadow-2xl space-y-10 border border-slate-800">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-900/30 text-blue-500 rounded-[32px] shadow-sm">
            <CalendarCheck size={48} />
          </div>
          <h2 className="text-4xl font-black text-slate-50 tracking-tight">Portal Escala</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-1">Usuário / E-mail</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 text-white font-bold rounded-[20px] outline-none focus:ring-4 focus:ring-blue-900/20 focus:border-blue-600 transition-all placeholder-slate-500" 
              placeholder="Digite seu usuário"
              required 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-1">Senha</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 text-white font-bold rounded-[20px] outline-none focus:ring-4 focus:ring-blue-900/20 focus:border-blue-600 transition-all placeholder-slate-500" 
              placeholder="Digite sua senha"
              required 
            />
          </div>
          {error && <p className="text-red-400 text-sm font-black text-center animate-shake bg-red-950/30 p-3 rounded-xl border border-red-900/50">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-[20px] shadow-xl hover:shadow-2xl transition-all transform active:scale-[0.98]">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ state: AppState; onGenerate: () => void; loading: boolean; error: string | null; apiError: boolean; onSelectKey: () => void }> = ({ state, onGenerate, loading, error, apiError, onSelectKey }) => (
  <div className="space-y-10">
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-10 rounded-[40px] shadow-sm border border-slate-800">
      <div>
        <h2 className="text-4xl font-black text-slate-50">Bem-vindo</h2>
        <p className="text-slate-400 font-bold mt-1">Gerencie as escalas de domingos e feriados.</p>
      </div>
      <button onClick={onGenerate} disabled={loading} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-[24px] font-black transition-all shadow-xl active:scale-95 disabled:opacity-50">
        <CalendarCheck size={24} /> Gerar Escala Mensal
      </button>
    </div>
    
    {apiError && (
      <div className="bg-amber-950/20 p-8 rounded-[40px] border-2 border-amber-900/50 flex flex-col md:flex-row items-center gap-8 animate-in zoom-in-95">
        <div className="p-5 bg-amber-900/30 text-amber-500 rounded-3xl">
          <KeyRound size={40} />
        </div>
        <div className="flex-1 space-y-2 text-center md:text-left">
          <h3 className="text-xl font-black text-amber-500 uppercase tracking-tight">API Key Bloqueada</h3>
          <p className="text-slate-300 font-medium">A chave de inteligência artificial padrão foi desativada. Para continuar gerando escalas, vincule sua própria chave de API.</p>
          <div className="pt-2">
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline text-xs font-bold flex items-center justify-center md:justify-start gap-1">
               <Info size={14}/> Saiba mais sobre faturamento da API
             </a>
          </div>
        </div>
        <button onClick={onSelectKey} className="bg-amber-600 hover:bg-amber-700 text-white px-10 py-4 rounded-2xl font-black shadow-lg transition-all whitespace-nowrap">
          Vincular Minha Chave
        </button>
      </div>
    )}

    {error && !apiError && (
      <div className="bg-red-950/20 p-6 rounded-[30px] border border-red-900/50 flex items-center gap-4 text-red-400 animate-in zoom-in-95">
        <AlertCircle size={24} />
        <p className="font-bold">{error}</p>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      <StatCard icon={<Building2 size={28} className="text-blue-500" />} label="Ambientes" value={state.environments.length} color="bg-blue-900/20" />
      <StatCard icon={<Tags size={28} className="text-emerald-500" />} label="Categorias" value={state.categories.length} color="bg-emerald-900/20" />
      <StatCard icon={<Users size={28} className="text-amber-500" />} label="Equipe" value={state.employees.length} color="bg-amber-900/20" />
      <StatCard icon={<CalendarDays size={28} className="text-purple-500" />} label="Dias Citados" value={state.specialDays.length} color="bg-purple-900/20" />
    </div>
  </div>
);

const StatCard: React.FC<any> = ({ icon, label, value, color }) => (
  <div className="bg-slate-900 p-8 rounded-[40px] shadow-sm border border-slate-800 flex items-center gap-6">
    <div className={`p-5 ${color} rounded-[28px]`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-black text-slate-50">{value}</p>
    </div>
  </div>
);

const Setup: React.FC<{ state: AppState; loadData: () => void; onReset: () => void; error: string | null; onSelectKey: () => void }> = ({ state, loadData, onReset, error, onSelectKey }) => {
  const [tab, setTab] = useState<'cat' | 'emp' | 'env' | 'day' | 'sys'>('cat');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (table: string, payload: any) => {
    setLoading(true);
    const { error } = await supabase.from(table).insert([payload]);
    if (error) {
      alert("Erro ao salvar no Supabase: " + error.message);
      loadData();
    } else {
      loadData();
    }
    setLoading(false);
  };

  const handleDel = async (table: string, id: string, field = 'id') => {
    if (!confirm("Excluir?")) return;
    setLoading(true);
    const { error } = await supabase.from(table).delete().eq(field, id);
    if (error) alert("Erro ao deletar: " + error.message);
    else loadData();
    setLoading(false);
  };

  return (
    <div className="bg-slate-900 rounded-[40px] shadow-sm border border-slate-800 overflow-hidden min-h-[600px] flex flex-col">
      <div className="flex border-b border-slate-800 bg-slate-950/30 p-2 overflow-x-auto">
        <TabBtn active={tab === 'cat'} onClick={() => setTab('cat')} label="Categorias" />
        <TabBtn active={tab === 'emp'} onClick={() => setTab('emp')} label="Equipe" />
        <TabBtn active={tab === 'env'} onClick={() => setTab('env')} label="Ambientes" />
        <TabBtn active={tab === 'day'} onClick={() => setTab('day')} label="Feriados/Dom" />
        <TabBtn active={tab === 'sys'} onClick={() => setTab('sys')} label="Sistema" />
      </div>
      
      {error && error.includes("security policy") && (
        <div className="m-6 p-6 bg-amber-950/20 border border-amber-900/50 rounded-3xl flex flex-col gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 text-amber-500 font-black">
            <Database size={20} />
            <span>CORREÇÃO DO BANCO DE DADOS NECESSÁRIA</span>
          </div>
          <p className="text-sm text-slate-300">
            Você precisa liberar o acesso no console do Supabase (SQL Editor) executando o comando abaixo:
          </p>
          <div className="bg-black/40 p-4 rounded-xl font-mono text-xs text-blue-400 overflow-x-auto select-all">
            ALTER TABLE categories_escala DISABLE ROW LEVEL SECURITY;
            ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
            ALTER TABLE environments DISABLE ROW LEVEL SECURITY;
            ALTER TABLE special_days DISABLE ROW LEVEL SECURITY;
            ALTER TABLE schedules DISABLE ROW LEVEL SECURITY;
          </div>
        </div>
      )}

      <div className="p-10 flex-1">
        {tab === 'cat' && <CategorySetup categories={state.categories} onAdd={(n: string) => handleAdd('categories_escala', { name: n })} onDel={(id: string) => handleDel('categories_escala', id)} />}
        {tab === 'emp' && <EmployeeSetup employees={state.employees} categories={state.categories} onAdd={(n: string, c: string, r: boolean) => handleAdd('employees', { name: n, category_id: c, is_restricted: r })} onDel={(id: string) => handleDel('employees', id)} />}
        {tab === 'env' && <EnvironmentSetup environments={state.environments} categories={state.categories} onAdd={(n: string, r: any) => handleAdd('environments', { name: n, requirements: r })} onDel={(id: string) => handleDel('environments', id)} />}
        {tab === 'day' && <DaySetup days={state.specialDays} onAdd={(d: string, n: string, t: any) => handleAdd('special_days', { date: d, name: n, type: t })} onDel={(date: string) => handleDel('special_days', date, 'date')} />}
        {tab === 'sys' && (
          <div className="space-y-12 animate-in fade-in">
             <div className="bg-slate-950/50 border border-slate-800 p-10 rounded-[40px] space-y-6">
                <div className="flex items-center gap-4 text-blue-500">
                  <KeyRound size={32} />
                  <h3 className="text-2xl font-black uppercase tracking-tight">Chave da Inteligência Artificial</h3>
                </div>
                <p className="text-slate-400 font-bold max-w-xl">
                  Se você estiver enfrentando erros de geração (como o erro 403), use o botão abaixo para configurar sua própria chave de API paga.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={onSelectKey}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-3"
                  >
                    <RotateCw size={20} /> Alterar Chave API
                  </button>
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-800 border border-slate-700 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all">
                    <ExternalLink size={18} /> Ver Documentação de Faturamento
                  </a>
                </div>
             </div>

             <div className="bg-red-950/20 border-2 border-red-900/50 p-10 rounded-[40px] space-y-6">
                <div className="flex items-center gap-4 text-red-500">
                  <ShieldAlert size={32} />
                  <h3 className="text-2xl font-black uppercase tracking-tight">Zona de Perigo</h3>
                </div>
                <p className="text-slate-400 font-bold max-w-xl">
                  Esta ação irá apagar permanentemente todos os dados de cadastro e escalas. 
                  O sistema voltará ao estado original, mantendo apenas o seu login.
                </p>
                <button 
                  onClick={onReset}
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-3"
                >
                  <Trash size={20} /> Limpar Toda a Base de Dados
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button onClick={onClick} className={`px-10 py-5 text-[11px] font-black uppercase tracking-widest transition-all rounded-2xl whitespace-nowrap ${active ? 'bg-slate-800 text-blue-500 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
    {label}
  </button>
);

const CategorySetup: React.FC<any> = ({ categories, onAdd, onDel }) => {
  const [name, setName] = useState('');
  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="flex gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Porteiro..." className="flex-1 bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none focus:border-blue-600" />
        <button onClick={() => { if(name){ onAdd(name); setName(''); } }} className="bg-blue-600 text-white px-8 rounded-[20px] font-black transition-all hover:bg-blue-500"><Plus/></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((c: any) => (
          <div key={c.id} className="flex justify-between items-center p-5 bg-slate-800/50 border border-slate-800 rounded-[24px]">
            <span className="font-bold text-slate-100">{c.name}</span>
            <button onClick={() => onDel(c.id)} className="text-red-400 hover:text-red-500"><Trash2 size={18}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmployeeSetup: React.FC<any> = ({ employees, categories, onAdd, onDel }) => {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('');
  const [res, setRes] = useState(false);
  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className="md:col-span-2 bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none" />
        <select value={cat} onChange={e => setCat(e.target.value)} className="bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none">
          <option value="">Categoria</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => { if(name && cat){ onAdd(name, cat, res); setName(''); setCat(''); setRes(false); } }} className="bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-[20px] font-black shadow-lg">Cadastrar</button>
      </div>
      <label className="flex items-center gap-4 cursor-pointer group">
        <input type="checkbox" checked={res} onChange={e => setRes(e.target.checked)} className="w-5 h-5 accent-blue-600" />
        <span className="text-xs font-black text-slate-400 group-hover:text-slate-200 uppercase">Colaborador com Restrição (Nunca trabalha só)</span>
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employees.map((e: any) => (
          <div key={e.id} className="p-6 bg-slate-800/50 border border-slate-800 rounded-[28px] flex justify-between items-center">
            <div>
              <p className="font-black text-slate-100 flex items-center gap-2 text-lg">{e.name} {e.isRestricted && <ShieldAlert size={16} className="text-red-500"/>}</p>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">{categories.find((c: any) => c.id === e.categoryId)?.name}</p>
            </div>
            <button onClick={() => onDel(e.id)} className="text-red-400 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const EnvironmentSetup: React.FC<any> = ({ environments, categories, onAdd, onDel }) => {
  const [name, setName] = useState('');
  const [reqs, setReqs] = useState<any>({});
  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Posto/Ambiente" className="w-full bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none" />
          <div className="bg-slate-950/50 p-6 rounded-[32px] space-y-4 border border-slate-800">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitos de Equipe:</p>
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-300">{c.name}</span>
                <input type="number" min="0" value={reqs[c.id] || 0} onChange={e => setReqs({...reqs, [c.id]: parseInt(e.target.value)||0})} className="w-16 py-2 bg-slate-800 border border-slate-700 rounded-xl text-center font-black text-white shadow-sm" />
              </div>
            ))}
          </div>
          <button onClick={() => { if(name){ onAdd(name, reqs); setName(''); setReqs({}); } }} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-5 rounded-[24px] font-black transition-all border border-slate-700">Salvar Posto</button>
        </div>
        <div className="space-y-4">
          {environments.map((env: any) => (
            <div key={env.id} className="p-6 bg-slate-800/50 border border-slate-800 rounded-[32px] flex justify-between items-start">
              <div className="space-y-2">
                <p className="font-black text-slate-100 text-lg">{env.name}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(env.requirements).map(([cid, qty]: any) => qty > 0 && (
                    <div key={cid} className="text-[9px] font-black bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-slate-400 shadow-sm">
                      {categories.find((c: any) => c.id === cid)?.name}: {qty}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => onDel(env.id)} className="text-red-400 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DaySetup: React.FC<any> = ({ days, onAdd, onDel }) => {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('holiday');
  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none" />
        <select value={type} onChange={e => setType(e.target.value)} className="bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none">
          <option value="holiday">Feriado</option>
          <option value="sunday">Domingo</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Identificação" className="bg-slate-800 border border-slate-700 px-6 py-4 rounded-[20px] text-white font-bold outline-none" />
        <button onClick={() => { if(date && name){ onAdd(date, name, type); setDate(''); setName(''); } }} className="bg-purple-600 hover:bg-purple-700 text-white rounded-[20px] font-black shadow-lg">Registrar</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {days.map((d: any) => (
          <div key={d.date} className="p-6 bg-slate-800/50 border border-slate-800 rounded-[28px] flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-4">
              <div className="text-purple-400"><CalendarDays size={24}/></div>
              <div>
                <p className="font-black text-slate-100">{new Date(d.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</p>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{d.name}</p>
              </div>
            </div>
            <button onClick={() => onDel(d.date)} className="text-red-400 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const CalendarView: React.FC<any> = ({ state, currentMonth, onMonthChange, onSwap, onGenerate, loading, error }) => {
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const entries = state.schedules[currentMonth] || [];

  const displayDays = state.specialDays
    .filter((d: SpecialDay) => d.date.startsWith(currentMonth))
    .sort((a: SpecialDay, b: SpecialDay) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-10 animate-in fade-in">
      <header className="flex flex-col lg:flex-row justify-between items-center gap-8 bg-slate-900 p-10 rounded-[40px] shadow-sm border border-slate-800">
        <div className="flex items-center gap-6">
          <button onClick={() => onMonthChange(-1)} className="p-4 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><ChevronLeft/></button>
          <h2 className="text-3xl font-black text-slate-50 capitalize min-w-[200px] text-center">{monthLabel}</h2>
          <button onClick={() => onMonthChange(1)} className="p-4 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><ChevronRight/></button>
        </div>
        <button onClick={onGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-[24px] font-black shadow-lg transition-all flex items-center gap-3">
           <CalendarCheck size={24} /> Otimizar Escala via IA
        </button>
      </header>

      {error && (
        <div className="bg-red-950/20 p-6 rounded-[30px] border border-red-900/50 flex items-center gap-4 text-red-400 font-black animate-in zoom-in-95">
          <AlertCircle size={24} /> {error}
        </div>
      )}

      {displayDays.length === 0 ? (
        <div className="bg-slate-900 p-24 rounded-[60px] border-2 border-dashed border-slate-800 text-center space-y-4">
          <CalendarDays size={64} className="mx-auto text-slate-700" />
          <h3 className="text-2xl font-black text-slate-500">Sem dias citados para {monthLabel}</h3>
          <p className="text-slate-400 font-bold max-w-md mx-auto">Cadastre os Domingos e Feriados deste mês na aba de Configurações para gerar a escala.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {displayDays.map((specialDay: SpecialDay) => {
            const dayEntries = entries.filter((e: any) => e.date === specialDay.date);
            const dateObj = new Date(specialDay.date);
            const dayNumber = dateObj.getUTCDate();
            
            return (
              <div key={specialDay.date} className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 shadow-sm flex flex-col hover:shadow-xl transition-all ring-offset-2 ring-blue-900/20 hover:ring-2">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col">
                    <span className="text-4xl font-black text-slate-50 leading-none">{dayNumber}</span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mt-1">{dateObj.toLocaleDateString('pt-BR', {weekday: 'long', timeZone: 'UTC'})}</span>
                  </div>
                  <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest text-white shadow-sm ${specialDay.type === 'holiday' ? 'bg-amber-600' : 'bg-blue-600'}`}>
                    {specialDay.name}
                  </span>
                </div>
                <div className="space-y-3">
                  {dayEntries.length === 0 ? (
                    <p className="text-xs text-slate-600 italic font-bold">Escala não gerada para este dia.</p>
                  ) : (
                    dayEntries.map((e: any) => {
                      const emp = state.employees.find((emp: any) => emp.id === e.employeeId);
                      const env = state.environments.find((env: any) => env.id === e.environmentId);
                      return (
                        <div key={e.employeeId + e.environmentId} className="group relative bg-slate-800 p-4 rounded-[20px] border border-slate-700 hover:bg-blue-600 hover:border-blue-700 hover:text-white transition-all shadow-sm">
                          <p className="text-[12px] font-black text-slate-100 group-hover:text-white truncate pr-2">{emp?.name || 'Vazio'}</p>
                          <p className="text-[9px] font-black text-slate-500 group-hover:text-blue-100 mt-0.5 uppercase flex items-center gap-1 tracking-wider"><Building2 size={10}/> {env?.name}</p>
                          
                          <div className="opacity-0 group-hover:opacity-100 absolute inset-0 bg-blue-600 rounded-[20px] flex items-center justify-center transition-all">
                            <select 
                              className="w-full bg-transparent text-white text-[11px] font-black text-center outline-none cursor-pointer"
                              value={e.employeeId}
                              onChange={(ev) => onSwap(specialDay.date, e.employeeId, ev.target.value)}
                            >
                              <option disabled value="">Trocar por...</option>
                              {state.employees.filter((x: any) => x.categoryId === e.categoryId).map((x: any) => (
                                <option key={x.id} value={x.id} className="text-slate-900">{x.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const EmployeesList: React.FC<{ state: AppState }> = ({ state }) => {
  const [search, setSearch] = useState('');
  const filtered = state.employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <h2 className="text-4xl font-black text-slate-50">Efetivo Total</h2>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Localizar..." className="w-full pl-14 pr-6 py-4 bg-slate-900 border-2 border-slate-800 rounded-[24px] outline-none shadow-sm focus:border-blue-600 transition-all text-white font-bold" />
        </div>
      </div>
      <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-950/30 border-b border-slate-800">
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-8">
                  <span className="font-black text-slate-100 text-xl">{e.name}</span>
                </td>
                <td className="p-8">
                  <span className="px-5 py-2 bg-slate-800 border border-slate-700 rounded-[14px] text-[10px] font-black text-slate-300 uppercase tracking-wider">
                    {state.categories.find(c => c.id === e.categoryId)?.name}
                  </span>
                </td>
                <td className="p-8">
                  {e.isRestricted ? (
                    <span className="flex items-center gap-2 text-red-400 font-black text-[11px] uppercase bg-red-950/30 px-4 py-2 rounded-xl border border-red-900/50 shadow-sm"><ShieldAlert size={16}/> Restrição</span>
                  ) : (
                    <span className="text-emerald-400 font-black text-[11px] uppercase bg-emerald-950/30 px-4 py-2 rounded-xl border border-emerald-900/50 shadow-sm">Disponível</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default App;