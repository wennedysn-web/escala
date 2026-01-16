
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
  ExternalLink
} from 'lucide-react';
import { Category, Employee, Environment, SpecialDay, ScheduleEntry, AppState } from './types';
import { generateScheduleWithAI } from './geminiService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// Fix: Estendendo a interface AIStudio em vez de redeclarar a propriedade aistudio no Window
// Isso resolve o erro de conflito de modificadores e tipos ("Property 'aistudio' must be of type 'AIStudio'")
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
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
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  useEffect(() => {
    const checkKey = async () => {
      // Usamos cast para AIStudio se necessário para garantir o acesso aos métodos
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      if (aistudio?.hasSelectedApiKey) {
        try {
          const has = await aistudio.hasSelectedApiKey();
          setHasApiKey(has);
        } catch (e) {
          console.warn("Could not check API Key status", e);
        }
      }
    };
    checkKey();
  }, []);

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
      console.error(err);
      setError("Nota: O acesso ao banco de dados pode estar restrito. Certifique-se de ter criado o usuário no Supabase.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('escala_session');
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleOpenKeySelector = async () => {
    const aistudio = (window as any).aistudio as AIStudio | undefined;
    if (aistudio?.openSelectKey) {
      await aistudio.openSelectKey();
      // Assume-se sucesso após abertura do diálogo conforme diretrizes (para evitar race condition)
      setHasApiKey(true);
      setError(null);
    }
  };

  const handleGenerateSchedule = async () => {
    if (state.employees.length === 0 || state.environments.length === 0) {
      setError("Cadastre a equipe e os ambientes nas configurações primeiro.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const entries = await generateScheduleWithAI(
        currentMonth,
        state.categories,
        state.employees,
        state.environments,
        state.specialDays
      );
      
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
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("API Key") || err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Erro de Autenticação: Por favor, clique em 'Ativar IA' para selecionar uma chave válida.");
      } else {
        setError(err.message || "Ocorreu um erro na IA. Tente novamente em instantes.");
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

    await supabase.from('schedules')
      .update({ employee_id: newEmpId })
      .match({ date, employee_id: oldEmpId, month_key: currentMonth });
  };

  if (!session) return <Login setSession={setSession} />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      <aside className="w-full md:w-72 bg-slate-900 text-white flex flex-col shrink-0 z-20">
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

        <div className="p-6 border-t border-slate-800 space-y-4">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all font-semibold group">
            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" /> 
            <span>Sair do sistema</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 md:p-10 lg:p-12 relative">
        {loading && (
          <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-md z-[60] flex items-center justify-center">
            <div className="bg-white p-8 rounded-[32px] shadow-2xl flex flex-col items-center gap-4 text-slate-800 border border-white">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                <RotateCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" size={16} />
              </div>
              <p className="font-bold text-sm tracking-tight">Processando dados...</p>
            </div>
          </div>
        )}
        
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'dashboard' && <Dashboard state={state} onGenerate={handleGenerateSchedule} onOpenKey={handleOpenKeySelector} hasKey={hasApiKey} loading={loading} error={error} />}
          {activeTab === 'setup' && <Setup state={state} loadData={loadInitialData} />}
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
              onOpenKey={handleOpenKeySelector}
              hasKey={hasApiKey}
              loading={loading}
            />
          )}
          {activeTab === 'employees' && <EmployeesList state={state} />}
        </div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-semibold ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 active:scale-95' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
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
    
    const userClean = username.trim().toLowerCase();
    const passClean = password.trim();

    if (userClean === 'admin' && passClean === 'tododia') {
      const mockSession = { user: { email: 'admin@escala.com', id: 'local-admin' }, expires_at: Date.now() + 86400000 };
      localStorage.setItem('escala_session', JSON.stringify(mockSession));
      setSession(mockSession);
      setLoading(false);
      return;
    }

    const loginEmail = userClean.includes('@') ? userClean : `${userClean}@escala.com`;
    const { error: authError } = await supabase.auth.signInWithPassword({ 
      email: loginEmail, 
      password: passClean
    });

    if (authError) {
      setError("Acesso negado. Verifique usuário e senha.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-6">
      <div className="w-full max-w-md bg-white p-10 md:p-12 rounded-[40px] shadow-2xl space-y-10 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
        
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-50 text-blue-600 rounded-[32px] mb-2 shadow-inner">
            <CalendarCheck size={48} />
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Portal Escala</h2>
          <p className="text-slate-500 font-medium text-sm">Gestão de Equipes Inteligente.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário</label>
            <div className="relative">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="admin" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="w-full pl-14 pr-6 py-4.5 bg-slate-50 border border-slate-100 rounded-[20px] text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium" 
                required 
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full pl-14 pr-6 py-4.5 bg-slate-50 border border-slate-100 rounded-[20px] text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium" 
                required 
              />
            </div>
          </div>
          {error && (
            <div className="text-red-600 text-xs font-bold bg-red-50 p-5 rounded-2xl border border-red-100 flex flex-col gap-2 animate-shake">
              <div className="flex items-center gap-3">
                <AlertCircle size={18} /> {error}
              </div>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 hover:bg-black text-white font-black py-5 rounded-[20px] transition-all disabled:opacity-50 shadow-2xl shadow-slate-900/30 active:scale-95 text-lg">
            {loading ? 'Validando...' : 'Entrar no Sistema'}
          </button>
        </form>
        
        <div className="pt-6 border-t border-slate-50 text-center space-y-2">
           <p className="text-[9px] text-slate-300 font-medium">Versão 3.0 Stable</p>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ state: AppState; onGenerate: () => void; onOpenKey: () => void; hasKey: boolean; loading: boolean; error: string | null }> = ({ state, onGenerate, onOpenKey, hasKey, loading, error }) => (
  <div className="space-y-10">
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-10 rounded-[40px] shadow-sm border border-slate-200/50">
      <div>
        <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">Gestão Ativa</h2>
        <p className="text-slate-500 font-semibold mt-1">Visão holística da operação mensal.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
        <button onClick={onGenerate} disabled={loading} className="group flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-[24px] font-black transition-all shadow-2xl shadow-blue-500/20 active:scale-95 disabled:opacity-50">
          <CalendarCheck size={24} className="group-hover:rotate-12 transition-transform" /> 
          Gerar Nova Escala
        </button>
        {!hasKey && (
          <button onClick={onOpenKey} className="group flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 text-white px-8 py-5 rounded-[24px] font-black transition-all shadow-2xl shadow-amber-500/20 active:scale-95">
            <Key size={24} className="group-hover:rotate-12 transition-transform" /> 
            Ativar IA (Selecionar Chave)
          </button>
        )}
      </div>
    </div>
    
    {error && (
      <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-5 rounded-3xl flex items-start gap-4 font-semibold text-sm shadow-sm">
        <AlertCircle size={24} className="shrink-0" />
        <div>
          <p className="font-bold">Aviso de Configuração:</p>
          <p className="mt-1 opacity-90">{error}</p>
          {!hasKey && (
            <div className="mt-3 flex flex-col gap-2">
              <button onClick={onOpenKey} className="text-xs font-black uppercase tracking-widest text-amber-800 bg-amber-200/50 px-4 py-2 rounded-lg w-fit hover:bg-amber-300 transition-colors">Selecionar Chave de API</button>
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[10px] text-amber-900/60 underline flex items-center gap-1">
                Ver documentação de faturamento <ExternalLink size={10}/>
              </a>
            </div>
          )}
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      <StatCard icon={<Building2 size={28} className="text-blue-600" />} label="Locais de Trabalho" value={state.environments.length} color="bg-blue-50/50" />
      <StatCard icon={<Tags size={28} className="text-emerald-600" />} label="Especialidades" value={state.categories.length} color="bg-emerald-50/50" />
      <StatCard icon={<Users size={28} className="text-amber-600" />} label="Efetivo Total" value={state.employees.length} color="bg-amber-50/50" />
      <StatCard icon={<CalendarDays size={28} className="text-purple-600" />} label="Feriados/Dom" value={state.specialDays.length} color="bg-purple-50/50" />
    </div>

    <div className="bg-white p-10 rounded-[40px] border border-slate-200/50 shadow-sm relative overflow-hidden">
       <div className="absolute top-0 right-0 p-8 text-blue-600/5"><UserCheck size={140} /></div>
       <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3 relative z-10">
         <UserCheck className="text-blue-600" size={24} /> Indicadores Rápidos
       </h3>
       <div className="flex flex-wrap gap-4 relative z-10">
          <div className="bg-slate-50 px-8 py-5 rounded-3xl border border-slate-100">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Colaboradores Ativos</p>
             <p className="text-3xl font-black text-slate-800">{state.employees.length}</p>
          </div>
          <div className="bg-slate-50 px-8 py-5 rounded-3xl border border-slate-100">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Restrições Identificadas</p>
             <p className="text-3xl font-black text-red-600">{state.employees.filter(e => e.isRestricted).length}</p>
          </div>
          <div className="bg-slate-50 px-8 py-5 rounded-3xl border border-slate-100">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Categorias Criadas</p>
             <p className="text-3xl font-black text-emerald-600">{state.categories.length}</p>
          </div>
       </div>
    </div>
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200/40 flex items-center gap-6 hover:shadow-xl hover:-translate-y-1 transition-all group cursor-default">
    <div className={`p-5 ${color} rounded-[28px] group-hover:scale-110 transition-transform`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
    </div>
  </div>
);

const Setup: React.FC<{ state: AppState; loadData: () => void }> = ({ state, loadData }) => {
  const [tab, setTab] = useState<'cat' | 'emp' | 'env' | 'day'>('cat');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (table: string, payload: any) => {
    setLoading(true);
    const { error } = await supabase.from(table).insert([payload]);
    if (error) alert("Erro ao salvar: " + error.message);
    else loadData();
    setLoading(false);
  };

  const handleDel = async (table: string, id: string, field = 'id') => {
    if (!confirm("Confirmar exclusão definitiva?")) return;
    setLoading(true);
    const { error } = await supabase.from(table).delete().eq(field, id);
    if (error) alert("Erro ao deletar: " + error.message);
    else loadData();
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-[40px] shadow-sm border border-slate-200/50 overflow-hidden min-h-[600px] flex flex-col">
      <div className="flex border-b border-slate-100 overflow-x-auto bg-slate-50/30 p-2 scrollbar-hide">
        <TabBtn active={tab === 'cat'} onClick={() => setTab('cat')} label="Categorias" />
        <TabBtn active={tab === 'emp'} onClick={() => setTab('emp')} label="Equipe" />
        <TabBtn active={tab === 'env'} onClick={() => setTab('env')} label="Ambientes" />
        <TabBtn active={tab === 'day'} onClick={() => setTab('day')} label="Feriados" />
      </div>
      <div className="p-10 flex-1">
        {tab === 'cat' && <CategorySetup categories={state.categories} onAdd={(n: string) => handleAdd('categories_escala', { name: n })} onDel={(id: string) => handleDel('categories_escala', id)} />}
        {tab === 'emp' && <EmployeeSetup employees={state.employees} categories={state.categories} onAdd={(n: string, c: string, r: boolean) => handleAdd('employees', { name: n, category_id: c, is_restricted: r })} onDel={(id: string) => handleDel('employees', id)} />}
        {tab === 'env' && <EnvironmentSetup environments={state.environments} categories={state.categories} onAdd={(n: string, r: any) => handleAdd('environments', { name: n, requirements: r })} onDel={(id: string) => handleDel('environments', id)} />}
        {tab === 'day' && <DaySetup days={state.specialDays} onAdd={(d: string, n: string, t: any) => handleAdd('special_days', { date: d, name: n, type: t })} onDel={(date: string) => handleDel('special_days', date, 'date')} />}
      </div>
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button onClick={onClick} className={`px-10 py-5 text-[11px] font-black uppercase tracking-widest transition-all rounded-2xl whitespace-nowrap ${active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
    {label}
  </button>
);

const CategorySetup: React.FC<any> = ({ categories, onAdd, onDel }) => {
  const [name, setName] = useState('');
  return (
    <div className="space-y-10 max-w-2xl animate-in fade-in duration-300">
      <div className="flex gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Porteiro, Vigilante..." className="flex-1 bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium" />
        <button onClick={() => { if(name){ onAdd(name); setName(''); } }} className="bg-slate-900 text-white px-8 rounded-[20px] font-black hover:bg-black transition active:scale-95"><Plus size={24}/></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((c: any) => (
          <div key={c.id} className="group flex justify-between items-center p-5 bg-slate-50/50 border border-slate-100 rounded-[24px] hover:bg-white hover:shadow-xl transition-all">
            <span className="font-bold text-slate-700">{c.name}</span>
            <button onClick={() => onDel(c.id)} className="text-slate-200 hover:text-red-500 transition-colors p-2"><Trash2 size={18}/></button>
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do colaborador" className="md:col-span-2 bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium" />
        <select value={cat} onChange={e => setCat(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 font-bold text-slate-500">
          <option value="">Selecione Categoria</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => { if(name && cat){ onAdd(name, cat, res); setName(''); setCat(''); setRes(false); } }} className="bg-blue-600 text-white py-4 rounded-[20px] font-black hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-500/20">Cadastrar</button>
      </div>
      <label className="flex items-center gap-4 p-6 bg-slate-50/50 border border-slate-100 rounded-[24px] w-fit cursor-pointer hover:bg-white transition-all group">
        <div className={`w-12 h-7 rounded-full transition-colors relative ${res ? 'bg-red-500' : 'bg-slate-200 group-hover:bg-slate-300'}`}>
           <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${res ? 'left-6' : 'left-1'}`}></div>
        </div>
        <input type="checkbox" className="hidden" checked={res} onChange={e => setRes(e.target.checked)} />
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Colaborador com Restrição (Não pode trabalhar sozinho)</span>
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employees.map((e: any) => (
          <div key={e.id} className="p-6 bg-slate-50/50 border border-slate-100 rounded-[28px] flex justify-between items-center group hover:bg-white hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-slate-400 border border-slate-100">{e.name.substring(0,2).toUpperCase()}</div>
               <div>
                  <p className="font-black text-slate-900 flex items-center gap-2 tracking-tight">{e.name} {e.isRestricted && <ShieldAlert size={16} className="text-red-500"/>}</p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{categories.find((c: any) => c.id === e.categoryId)?.name}</p>
               </div>
            </div>
            <button onClick={() => onDel(e.id)} className="text-slate-200 hover:text-red-500 transition-colors p-2"><Trash2 size={20}/></button>
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
    <div className="space-y-10 max-w-5xl animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block ml-1">Configuração de Posto/Ambiente</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Posto (Ex: Recepção Norte)" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 font-medium transition-all" />
          
          <div className="bg-slate-50 p-8 rounded-[32px] space-y-5 border border-slate-100 shadow-inner">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Equipe necessária por dia:</p>
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between group">
                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">{c.name}</span>
                <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-2">
                   <input type="number" min="0" value={reqs[c.id] || 0} onChange={e => setReqs({...reqs, [c.id]: parseInt(e.target.value)||0})} className="w-16 py-2 text-center font-black text-slate-900 outline-none" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { if(name){ onAdd(name, reqs); setName(''); setReqs({}); } }} className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-95">Salvar Novo Posto</button>
        </div>

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
          {environments.map((env: any) => (
            <div key={env.id} className="p-6 bg-slate-50/50 border border-slate-100 rounded-[32px] flex justify-between items-start group hover:bg-white hover:shadow-xl transition-all">
              <div className="space-y-3">
                <p className="font-black text-slate-900 text-lg tracking-tight">{env.name}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(env.requirements).map(([cid, qty]: any) => qty > 0 && (
                    <div key={cid} className="text-[9px] font-black bg-white border border-slate-100 px-3 py-1.5 rounded-xl uppercase text-slate-500 shadow-sm flex items-center">
                      {categories.find((c: any) => c.id === cid)?.name}: <span className="text-blue-600 ml-1 font-black">{qty}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => onDel(env.id)} className="text-slate-200 hover:text-red-500 transition-colors p-2"><Trash2 size={18}/></button>
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 font-bold text-slate-600" />
        <select value={type} onChange={e => setType(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 font-bold text-slate-600">
          <option value="holiday">Feriado</option>
          <option value="sunday">Domingo</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Identificação" className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100 font-medium" />
        <button onClick={() => { if(date && name){ onAdd(date, name, type); setDate(''); setName(''); } }} className="bg-purple-600 text-white rounded-[20px] font-black hover:bg-purple-700 transition active:scale-95 shadow-lg shadow-purple-500/20">Registrar</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {days.map((d: any) => (
          <div key={d.date} className="p-6 bg-slate-50/50 border border-slate-100 rounded-[28px] flex justify-between items-center group hover:bg-white hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="bg-white p-3 rounded-2xl border border-slate-100 text-purple-600 shadow-sm"><CalendarDays size={20}/></div>
              <div>
                <p className="font-black text-slate-900 leading-tight">{new Date(d.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</p>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1">{d.name}</p>
              </div>
            </div>
            <button onClick={() => onDel(d.date)} className="text-slate-200 hover:text-red-500 transition-colors p-2"><Trash2 size={18}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const CalendarView: React.FC<any> = ({ state, currentMonth, onMonthChange, onSwap, onGenerate, onOpenKey, hasKey, loading }) => {
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const entries = state.schedules[currentMonth] || [];

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row justify-between items-center gap-8 bg-white p-10 rounded-[40px] shadow-sm border border-slate-200/50">
        <div className="flex items-center gap-6">
          <button onClick={() => onMonthChange(-1)} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90"><ChevronLeft size={24}/></button>
          <h2 className="text-3xl font-black text-slate-900 capitalize min-w-[220px] text-center tracking-tight leading-none">{monthLabel}</h2>
          <button onClick={() => onMonthChange(1)} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90"><ChevronRight size={24}/></button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {!hasKey && (
            <button onClick={onOpenKey} className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-4 rounded-[20px] font-black shadow-lg shadow-amber-500/20 transition-all text-sm flex items-center justify-center gap-2">
              <Key size={18} /> Ativar IA
            </button>
          )}
          <button onClick={onGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-[24px] font-black shadow-2xl shadow-blue-500/30 active:scale-95 transition-all text-lg flex items-center justify-center gap-3">
             <CalendarCheck size={24} /> Otimizar Escala via IA
          </button>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="bg-white p-24 rounded-[60px] border-2 border-dashed border-slate-200 text-center space-y-6">
          <div className="bg-slate-50 w-32 h-32 rounded-[48px] flex items-center justify-center mx-auto text-slate-200 shadow-inner"><CalendarDays size={64}/></div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-400">Nenhum registro para {monthLabel}</h3>
            <p className="text-slate-400 max-w-sm mx-auto font-medium">Use nossa inteligência artificial para distribuir sua equipe de forma justa e otimizada.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
          {Array.from({length: daysInMonth}, (_, i) => {
            const day = i + 1;
            const ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const special = state.specialDays.find((sd: any) => sd.date === ds);
            const dayEntries = entries.filter((e: any) => e.date === ds);
            return (
              <div key={ds} className={`bg-white rounded-[40px] p-8 border ${special ? 'border-amber-300 ring-8 ring-amber-50 shadow-xl' : 'border-slate-200/50 shadow-sm'} flex flex-col min-h-[220px] transition-all hover:shadow-2xl hover:-translate-y-1 group/day`}>
                <div className="flex justify-between items-start mb-6">
                  <span className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{day}</span>
                  {special && <span className="text-[9px] font-black bg-amber-500 text-white px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-amber-500/20">{special.name}</span>}
                </div>
                <div className="space-y-3 flex-1 overflow-visible">
                  {dayEntries.map((e: any) => {
                    const emp = state.employees.find((emp: any) => emp.id === e.employeeId);
                    const env = state.environments.find((env: any) => env.id === e.environmentId);
                    return (
                      <div key={e.employeeId + e.environmentId} className="group relative bg-slate-50 p-4 rounded-[20px] border border-slate-100 hover:bg-blue-600 transition-all cursor-default overflow-hidden">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-[12px] font-black text-slate-800 group-hover:text-white leading-tight truncate pr-4">{emp?.name || 'Vazio'}</p>
                          <div className="opacity-0 group-hover:opacity-100 absolute inset-0 w-full h-full flex items-center justify-center">
                            <select 
                              className="w-full h-full cursor-pointer bg-blue-600 border-none appearance-none font-black text-[11px] text-white text-center outline-none px-4"
                              value={e.employeeId}
                              onChange={(ev) => onSwap(ds, e.employeeId, ev.target.value)}
                            >
                              <option disabled value="">Substituir...</option>
                              {state.employees.filter((x: any) => x.categoryId === e.categoryId).map((x: any) => (
                                <option key={x.id} value={x.id} className="text-slate-900">{x.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-200 mt-1 uppercase flex items-center gap-1.5"><Building2 size={10}/> {env?.name}</p>
                      </div>
                    );
                  })}
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
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Efetivo Operacional</h2>
          <p className="text-slate-500 font-semibold mt-1">Quadro completo de colaboradores.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Localizar por nome..." className="w-full pl-14 pr-6 py-4.5 bg-white border border-slate-200/50 rounded-[24px] shadow-sm outline-none focus:ring-4 focus:ring-blue-100 font-medium transition-all" />
        </div>
      </div>
      
      <div className="bg-white rounded-[40px] border border-slate-200/50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
                <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-8">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-[20px] flex items-center justify-center font-black text-sm border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                        {e.name.substring(0,2).toUpperCase()}
                      </div>
                      <span className="font-black text-slate-800 text-lg group-hover:text-blue-600 transition-colors tracking-tight">{e.name}</span>
                    </div>
                  </td>
                  <td className="p-8">
                    <span className="px-5 py-2 bg-white border border-slate-200 rounded-[14px] text-[10px] font-black text-slate-500 uppercase tracking-widest shadow-sm">
                      {state.categories.find(c => c.id === e.categoryId)?.name}
                    </span>
                  </td>
                  <td className="p-8">
                    {e.isRestricted ? (
                      <span className="flex items-center gap-2 text-red-500 font-black text-[11px] uppercase tracking-tighter bg-red-50 px-4 py-2 rounded-xl border border-red-100 w-fit shadow-sm"><ShieldAlert size={16}/> Com Restrição</span>
                    ) : (
                      <span className="text-emerald-500 font-black text-[11px] uppercase tracking-tighter bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 w-fit shadow-sm flex items-center gap-2">Disponibilidade Total</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-20 text-center text-slate-300 font-bold italic tracking-tight">Nenhum integrante encontrado para sua busca.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
