
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
  Info
} from 'lucide-react';
import { Category, Employee, Environment, SpecialDay, ScheduleEntry, AppState } from './types';
import { generateScheduleWithAI } from './geminiService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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
    const localSess = localStorage.getItem('escala_session');
    if (localSess) setSession(JSON.parse(localSess));

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
      setError("Erro ao carregar dados. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('escala_session');
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleGenerateSchedule = async () => {
    if (state.employees.length === 0 || state.environments.length === 0) {
      setError("Cadastre a equipe e os ambientes nas configurações primeiro.");
      return;
    }

    const currentMonthDays = state.specialDays.filter(d => d.date.startsWith(currentMonth));
    if (currentMonthDays.length === 0) {
      setError("Nenhum Domingo ou Feriado cadastrado para este mês. Cadastre-os na aba Configurações > Feriados.");
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
      
      if (!entries || entries.length === 0) {
        throw new Error("A IA não conseguiu gerar entradas para os dias solicitados.");
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
      console.error(err);
      setError(err.message || "Erro desconhecido ao gerar escala.");
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

        <div className="p-6 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all font-semibold group">
            <LogOut size={18} /> 
            <span>Sair do sistema</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 md:p-10 lg:p-12 relative">
        {loading && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center">
            <div className="bg-white p-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 border border-slate-100">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="font-black text-xl text-slate-900">Gerando Escala...</p>
                <p className="text-slate-500 text-sm mt-1">A IA está distribuindo a equipe de forma justa.</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'dashboard' && <Dashboard state={state} onGenerate={handleGenerateSchedule} loading={loading} error={error} />}
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

// ... (NavItem, Login, StatCard permanecem iguais)
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
    if (username.trim().toLowerCase() === 'admin' && password.trim() === 'tododia') {
      const mockSession = { user: { email: 'admin@escala.com', id: 'local-admin' } };
      localStorage.setItem('escala_session', JSON.stringify(mockSession));
      setSession(mockSession);
    } else {
      setError("Acesso negado.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-6">
      <div className="w-full max-w-md bg-white p-10 md:p-12 rounded-[40px] shadow-2xl space-y-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-50 text-blue-600 rounded-[32px]">
            <CalendarCheck size={48} />
          </div>
          <h2 className="text-4xl font-black text-slate-900">Portal Escala</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase">Usuário</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100" required />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase">Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[20px] outline-none focus:ring-4 focus:ring-blue-100" required />
          </div>
          {error && <p className="text-red-600 text-xs font-bold text-center">{error}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-[20px] shadow-2xl">Entrar</button>
        </form>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ state: AppState; onGenerate: () => void; loading: boolean; error: string | null }> = ({ state, onGenerate, loading, error }) => (
  <div className="space-y-10">
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-10 rounded-[40px] shadow-sm border border-slate-200/50">
      <div>
        <h2 className="text-4xl font-black text-slate-900">Bem-vindo</h2>
        <p className="text-slate-500 font-semibold mt-1">Gerencie as escalas de domingos e feriados.</p>
      </div>
      <button onClick={onGenerate} disabled={loading} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-[24px] font-black transition-all shadow-xl active:scale-95 disabled:opacity-50">
        <CalendarCheck size={24} /> Gerar Escala Mensal
      </button>
    </div>
    
    {error && (
      <div className="bg-red-50 p-6 rounded-[30px] border border-red-100 flex items-center gap-4 text-red-600 animate-in zoom-in-95">
        <AlertCircle size={24} />
        <p className="font-bold">{error}</p>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      <StatCard icon={<Building2 size={28} className="text-blue-600" />} label="Ambientes" value={state.environments.length} color="bg-blue-50" />
      <StatCard icon={<Tags size={28} className="text-emerald-600" />} label="Categorias" value={state.categories.length} color="bg-emerald-50" />
      <StatCard icon={<Users size={28} className="text-amber-600" />} label="Equipe" value={state.employees.length} color="bg-amber-50" />
      <StatCard icon={<CalendarDays size={28} className="text-purple-600" />} label="Dias Citados" value={state.specialDays.length} color="bg-purple-50" />
    </div>
  </div>
);

const StatCard: React.FC<any> = ({ icon, label, value, color }) => (
  <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200/40 flex items-center gap-6">
    <div className={`p-5 ${color} rounded-[28px]`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-black text-slate-900">{value}</p>
    </div>
  </div>
);

// ... (Setup, TabBtn, CategorySetup, EmployeeSetup, EnvironmentSetup, DaySetup permanecem iguais)

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
    if (!confirm("Excluir?")) return;
    setLoading(true);
    const { error } = await supabase.from(table).delete().eq(field, id);
    if (error) alert("Erro ao deletar: " + error.message);
    else loadData();
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-[40px] shadow-sm border border-slate-200/50 overflow-hidden min-h-[600px] flex flex-col">
      <div className="flex border-b border-slate-100 bg-slate-50/30 p-2 overflow-x-auto">
        <TabBtn active={tab === 'cat'} onClick={() => setTab('cat')} label="Categorias" />
        <TabBtn active={tab === 'emp'} onClick={() => setTab('emp')} label="Equipe" />
        <TabBtn active={tab === 'env'} onClick={() => setTab('env')} label="Ambientes" />
        <TabBtn active={tab === 'day'} onClick={() => setTab('day')} label="Feriados/Dom" />
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
    <div className="space-y-10 animate-in fade-in">
      <div className="flex gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Porteiro..." className="flex-1 bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]" />
        <button onClick={() => { if(name){ onAdd(name); setName(''); } }} className="bg-slate-900 text-white px-8 rounded-[20px] font-black"><Plus/></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((c: any) => (
          <div key={c.id} className="flex justify-between items-center p-5 bg-slate-50 border border-slate-100 rounded-[24px]">
            <span className="font-bold">{c.name}</span>
            <button onClick={() => onDel(c.id)} className="text-red-400"><Trash2 size={18}/></button>
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
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className="md:col-span-2 bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]" />
        <select value={cat} onChange={e => setCat(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]">
          <option value="">Categoria</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => { if(name && cat){ onAdd(name, cat, res); setName(''); setCat(''); setRes(false); } }} className="bg-blue-600 text-white py-4 rounded-[20px] font-black">Cadastrar</button>
      </div>
      <label className="flex items-center gap-4 cursor-pointer">
        <input type="checkbox" checked={res} onChange={e => setRes(e.target.checked)} className="w-5 h-5" />
        <span className="text-xs font-black text-slate-500 uppercase">Colaborador com Restrição (Nunca trabalha só)</span>
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employees.map((e: any) => (
          <div key={e.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[28px] flex justify-between items-center">
            <div>
              <p className="font-black text-slate-900 flex items-center gap-2">{e.name} {e.isRestricted && <ShieldAlert size={16} className="text-red-500"/>}</p>
              <p className="text-[10px] text-slate-400 font-black uppercase">{categories.find((c: any) => c.id === e.categoryId)?.name}</p>
            </div>
            <button onClick={() => onDel(e.id)} className="text-red-400"><Trash2 size={20}/></button>
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
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Posto/Ambiente" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]" />
          <div className="bg-slate-50 p-6 rounded-[32px] space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase">Requisitos de Equipe:</p>
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">{c.name}</span>
                <input type="number" min="0" value={reqs[c.id] || 0} onChange={e => setReqs({...reqs, [c.id]: parseInt(e.target.value)||0})} className="w-16 py-2 bg-white border border-slate-100 rounded-xl text-center font-black" />
              </div>
            ))}
          </div>
          <button onClick={() => { if(name){ onAdd(name, reqs); setName(''); setReqs({}); } }} className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black">Salvar Posto</button>
        </div>
        <div className="space-y-4">
          {environments.map((env: any) => (
            <div key={env.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] flex justify-between items-start">
              <div className="space-y-2">
                <p className="font-black text-slate-900">{env.name}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(env.requirements).map(([cid, qty]: any) => qty > 0 && (
                    <div key={cid} className="text-[9px] font-black bg-white border border-slate-100 px-2 py-1 rounded-lg text-slate-500">
                      {categories.find((c: any) => c.id === cid)?.name}: {qty}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => onDel(env.id)} className="text-red-400"><Trash2 size={18}/></button>
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
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]" />
        <select value={type} onChange={e => setType(e.target.value)} className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]">
          <option value="holiday">Feriado</option>
          <option value="sunday">Domingo</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Identificação" className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[20px]" />
        <button onClick={() => { if(date && name){ onAdd(date, name, type); setDate(''); setName(''); } }} className="bg-purple-600 text-white rounded-[20px] font-black">Registrar</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {days.map((d: any) => (
          <div key={d.date} className="p-6 bg-slate-50 border border-slate-100 rounded-[28px] flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="text-purple-600"><CalendarDays size={24}/></div>
              <div>
                <p className="font-black text-slate-900">{new Date(d.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</p>
                <p className="text-[10px] font-black text-blue-500 uppercase">{d.name}</p>
              </div>
            </div>
            <button onClick={() => onDel(d.date)} className="text-red-400"><Trash2 size={18}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const CalendarView: React.FC<any> = ({ state, currentMonth, onMonthChange, onSwap, onGenerate, loading, error }) => {
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const entries = state.schedules[currentMonth] || [];

  // FILTRO: Exibe APENAS os domingos e feriados cadastrados que pertencem ao mês atual
  const displayDays = state.specialDays
    .filter(d => d.date.startsWith(currentMonth))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-10 animate-in fade-in">
      <header className="flex flex-col lg:flex-row justify-between items-center gap-8 bg-white p-10 rounded-[40px] shadow-sm border border-slate-200/50">
        <div className="flex items-center gap-6">
          <button onClick={() => onMonthChange(-1)} className="p-4 bg-slate-50 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><ChevronLeft/></button>
          <h2 className="text-3xl font-black text-slate-900 capitalize min-w-[200px] text-center">{monthLabel}</h2>
          <button onClick={() => onMonthChange(1)} className="p-4 bg-slate-50 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><ChevronRight/></button>
        </div>
        <button onClick={onGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-[24px] font-black shadow-lg transition-all flex items-center gap-3">
           <CalendarCheck size={24} /> Otimizar Escala via IA
        </button>
      </header>

      {error && (
        <div className="bg-red-50 p-6 rounded-[30px] border border-red-100 flex items-center gap-4 text-red-600 font-bold">
          <AlertCircle size={24} /> {error}
        </div>
      )}

      {displayDays.length === 0 ? (
        <div className="bg-white p-24 rounded-[60px] border-2 border-dashed border-slate-200 text-center space-y-4">
          <CalendarDays size={64} className="mx-auto text-slate-200" />
          <h3 className="text-2xl font-black text-slate-400">Sem dias citados para {monthLabel}</h3>
          <p className="text-slate-400">Cadastre os Domingos e Feriados deste mês na aba de Configurações para gerar a escala.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {displayDays.map((specialDay) => {
            const dayEntries = entries.filter((e: any) => e.date === specialDay.date);
            const dateObj = new Date(specialDay.date);
            const dayNumber = dateObj.getUTCDate();
            
            return (
              <div key={specialDay.date} className="bg-white rounded-[40px] p-8 border border-slate-200/50 shadow-sm flex flex-col hover:shadow-xl transition-all ring-offset-2 ring-blue-50 hover:ring-2">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col">
                    <span className="text-4xl font-black text-slate-900 leading-none">{dayNumber}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mt-1">{dateObj.toLocaleDateString('pt-BR', {weekday: 'long', timeZone: 'UTC'})}</span>
                  </div>
                  <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest text-white ${specialDay.type === 'holiday' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                    {specialDay.name}
                  </span>
                </div>
                <div className="space-y-3">
                  {dayEntries.length === 0 ? (
                    <p className="text-xs text-slate-300 italic">Escala não gerada para este dia.</p>
                  ) : (
                    dayEntries.map((e: any) => {
                      const emp = state.employees.find((emp: any) => emp.id === e.employeeId);
                      const env = state.environments.find((env: any) => env.id === e.environmentId);
                      return (
                        <div key={e.employeeId + e.environmentId} className="group relative bg-slate-50 p-4 rounded-[20px] border border-slate-100 hover:bg-blue-600 hover:text-white transition-all">
                          <p className="text-[12px] font-black text-slate-800 group-hover:text-white truncate pr-2">{emp?.name || 'Vazio'}</p>
                          <p className="text-[9px] font-bold text-slate-400 group-hover:text-blue-100 mt-0.5 uppercase flex items-center gap-1"><Building2 size={10}/> {env?.name}</p>
                          
                          {/* Substituição Rápida */}
                          <div className="opacity-0 group-hover:opacity-100 absolute inset-0 bg-blue-600 rounded-[20px] flex items-center justify-center">
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
        <h2 className="text-4xl font-black text-slate-900">Efetivo Total</h2>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Localizar..." className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200/50 rounded-[24px] outline-none shadow-sm" />
        </div>
      </div>
      <div className="bg-white rounded-[40px] border border-slate-200/50 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase">Colaborador</th>
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase">Categoria</th>
              <th className="p-8 text-[11px] font-black text-slate-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-8">
                  <span className="font-black text-slate-800 text-lg">{e.name}</span>
                </td>
                <td className="p-8">
                  <span className="px-5 py-2 bg-white border border-slate-200 rounded-[14px] text-[10px] font-black text-slate-500 uppercase">
                    {state.categories.find(c => c.id === e.categoryId)?.name}
                  </span>
                </td>
                <td className="p-8">
                  {e.isRestricted ? (
                    <span className="flex items-center gap-2 text-red-500 font-black text-[11px] uppercase bg-red-50 px-4 py-2 rounded-xl"><ShieldAlert size={16}/> Restrição</span>
                  ) : (
                    <span className="text-emerald-500 font-black text-[11px] uppercase bg-emerald-50 px-4 py-2 rounded-xl">Disponível</span>
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
