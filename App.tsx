
import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowDownAz,
  ArrowUpAz,
  Database,
  WifiOff,
  Mail,
  Lock
} from 'lucide-react';
import { Category, Employee, Environment, SpecialDay, ScheduleEntry, AppState } from './types';
import { generateScheduleWithAI } from './geminiService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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

  // Monitorar estado de autenticação real
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      if (isSupabaseConfigured) {
        loadInitialData();
      } else {
        setError("Supabase não configurado corretamente nas variáveis de ambiente.");
      }
    }
  }, [session]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, emps, envs, days, schs] = await Promise.all([
        supabase.from('categories_escala').select('*'),
        supabase.from('employees').select('*'),
        supabase.from('environments').select('*'),
        supabase.from('special_days').select('*'),
        supabase.from('schedules').select('*')
      ]);

      if (cats.error || emps.error || envs.error || days.error || schs.error) {
        throw new Error("Erro ao buscar dados. Verifique as permissões RLS no Supabase.");
      }

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
      setError(err.message || "Falha ao carregar dados do banco de dados.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const checkConfig = () => {
    if (!isSupabaseConfigured) {
      alert("Ação bloqueada: Supabase não está configurado.");
      return false;
    }
    return true;
  };

  // Handlers Supabase
  const addCategory = async (name: string) => {
    if (!checkConfig()) return;
    const { data, error } = await supabase.from('categories_escala').insert([{ name }]).select();
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, categories: [...prev.categories, data[0]] }));
  };

  const deleteCategory = async (id: string) => {
    if (!checkConfig()) return;
    const { error } = await supabase.from('categories_escala').delete().eq('id', id);
    if (error) return alert(error.message);
    setState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c.id !== id),
      employees: prev.employees.filter(e => e.categoryId !== id)
    }));
  };

  const addEmployee = async (name: string, categoryId: string, isRestricted: boolean) => {
    if (!checkConfig()) return;
    const { data, error } = await supabase.from('employees').insert([{ name, category_id: categoryId, is_restricted: isRestricted }]).select();
    if (error) return alert(error.message);
    const newEmp: Employee = {
      id: data[0].id,
      name: data[0].name,
      categoryId: data[0].category_id,
      active: data[0].active,
      isRestricted: data[0].is_restricted
    };
    setState(prev => ({ ...prev, employees: [...prev.employees, newEmp] }));
  };

  const deleteEmployee = async (id: string) => {
    if (!checkConfig()) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, employees: prev.employees.filter(e => e.id !== id) }));
  };

  const addEnvironment = async (name: string, requirements: Record<string, number>) => {
    if (!checkConfig()) return;
    const { data, error } = await supabase.from('environments').insert([{ name, requirements }]).select();
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, environments: [...prev.environments, data[0]] }));
  };

  const deleteEnvironment = async (id: string) => {
    if (!checkConfig()) return;
    const { error } = await supabase.from('environments').delete().eq('id', id);
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, environments: prev.environments.filter(e => e.id !== id) }));
  };

  const addSpecialDay = async (date: string, name: string, type: 'holiday' | 'sunday') => {
    if (!checkConfig()) return;
    const { error } = await supabase.from('special_days').insert([{ date, name, type }]);
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, specialDays: [...prev.specialDays, { date, name, type }] }));
  };

  const deleteSpecialDay = async (date: string) => {
    if (!checkConfig()) return;
    const { error } = await supabase.from('special_days').delete().eq('date', date);
    if (error) return alert(error.message);
    setState(prev => ({ ...prev, specialDays: prev.specialDays.filter(d => d.date !== date) }));
  };

  const handleGenerateSchedule = async () => {
    if (!checkConfig()) return;
    if (state.employees.length === 0 || state.environments.length === 0) {
      setError("Cadastre funcionários e ambientes antes de gerar a escala.");
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
      setError("Erro ao gerar escala via IA. Verifique as chaves de API.");
    } finally {
      setLoading(false);
    }
  };

  const swapEmployee = async (date: string, oldEmpId: string, newEmpId: string) => {
    if (!checkConfig()) return;
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

  const changeMonth = (offset: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  if (!session) return <Login />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarCheck className="text-blue-400" />
            App Escala
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <RotateCw size={18} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('setup')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${activeTab === 'setup' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Building2 size={18} /> Configurações
          </button>
          <button onClick={() => setActiveTab('calendar')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${activeTab === 'calendar' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <CalendarDays size={18} /> Escala Mensal
          </button>
          <button onClick={() => setActiveTab('employees')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${activeTab === 'employees' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Users size={18} /> Colaboradores
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className={`flex items-center gap-2 px-4 py-1 text-[9px] font-bold uppercase tracking-widest ${isSupabaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isSupabaseConfigured ? <Database size={10} /> : <WifiOff size={10} />}
            {isSupabaseConfigured ? 'Supabase Online' : 'DB Offline'}
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition text-sm font-medium">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-4 md:p-8">
        {!isSupabaseConfigured && (
           <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4 text-amber-800">
             <AlertCircle className="shrink-0" size={24} />
             <div className="text-sm">
               <p className="font-bold">Configuração Pendente</p>
               <p>O Supabase não foi configurado. As alterações não serão salvas. Defina <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b>.</p>
             </div>
           </div>
        )}
        {loading && <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center font-bold text-slate-900 gap-2"><RotateCw className="animate-spin" /> Carregando...</div>}
        {activeTab === 'dashboard' && <Dashboard state={state} onGenerate={handleGenerateSchedule} loading={loading} error={error} />}
        {activeTab === 'setup' && <Setup state={state} onAddCat={addCategory} onDelCat={deleteCategory} onAddEmp={addEmployee} onDelEmp={deleteEmployee} onAddEnv={addEnvironment} onDelEnv={deleteEnvironment} onAddDay={addSpecialDay} onDelDay={deleteSpecialDay} />}
        {activeTab === 'calendar' && <CalendarView state={state} currentMonth={currentMonth} onMonthChange={changeMonth} onSwap={swapEmployee} onGenerate={handleGenerateSchedule} loading={loading} />}
        {activeTab === 'employees' && <EmployeesList state={state} currentMonth={currentMonth} />}
      </main>
    </div>
  );
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-2"><CalendarCheck className="text-blue-600" size={32} /></div>
          <h2 className="text-3xl font-bold text-slate-900">App Escala</h2>
          <p className="text-slate-500 text-sm">Acesso Restrito ao Gestor</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 text-slate-400" size={18} />
            <input 
              type="email" 
              placeholder="E-mail" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" 
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-slate-400" size={18} />
            <input 
              type="password" 
              placeholder="Senha" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" 
              required
            />
          </div>
          {error && <div className="text-red-600 text-xs font-bold bg-red-50 p-3 rounded-lg border border-red-100 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
        <p className="text-center text-[10px] text-slate-400">Certifique-se de ter criado um usuário no console do Supabase Auth.</p>
      </div>
    </div>
  );
};

// ... Restante dos sub-componentes (Dashboard, Setup, CalendarView, EmployeesList, etc) permanecem os mesmos mas com suporte a categories_escala ...
const Dashboard: React.FC<{ state: AppState; onGenerate: () => void; loading: boolean; error: string | null }> = ({ state, onGenerate, loading, error }) => (
  <div className="space-y-6 max-w-5xl mx-auto">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div><h2 className="text-2xl font-bold text-slate-800">Painel de Controle</h2><p className="text-slate-500">Visão geral da operação mensal.</p></div>
      <button onClick={onGenerate} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition shadow-md disabled:opacity-50">
        {loading ? <RotateCw className="animate-spin" size={20} /> : <CalendarCheck size={20} />} Gerar Escala com IA
      </button>
    </div>
    {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center gap-3 font-medium text-sm"><AlertCircle size={20} />{error}</div>}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard icon={<Building2 className="text-blue-500" />} label="Ambientes" value={state.environments.length} />
      <StatCard icon={<Tags className="text-emerald-500" />} label="Categorias" value={state.categories.length} />
      <StatCard icon={<Users className="text-amber-500" />} label="Funcionários" value={state.employees.length} />
      <StatCard icon={<CalendarDays className="text-purple-500" />} label="Especiais" value={state.specialDays.length} />
    </div>
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
    <div className="p-3 bg-slate-50 rounded-lg">{icon}</div>
    <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p><p className="text-2xl font-bold text-slate-800">{value}</p></div>
  </div>
);

const Setup: React.FC<{ state: AppState; onAddCat: (n: string) => void; onDelCat: (id: string) => void; onAddEmp: (n: string, c: string, r: boolean) => void; onDelEmp: (id: string) => void; onAddEnv: (n: string, r: Record<string, number>) => void; onDelEnv: (id: string) => void; onAddDay: (d: string, n: string, t: 'holiday' | 'sunday') => void; onDelDay: (d: string) => void; }> = ({ state, onAddCat, onDelCat, onAddEmp, onDelEmp, onAddEnv, onDelEnv, onAddDay, onDelDay }) => {
  const [catName, setCatName] = useState('');
  const [empName, setEmpName] = useState('');
  const [empCatId, setEmpCatId] = useState('');
  const [empRestricted, setEmpRestricted] = useState(false);
  const [envName, setEnvName] = useState('');
  const [envReqs, setEnvReqs] = useState<Record<string, number>>({});
  const [dayDate, setDayDate] = useState('');
  const [dayName, setDayName] = useState('');
  const [dayType, setDayType] = useState<'holiday' | 'sunday'>('sunday');

  const inputClass = "flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";
  const selectClass = "flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all";

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-emerald-600"><Tags size={18} /> Categorias</h3>
          <div className="flex gap-2 mb-4">
            <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Ex: Porteiro" className={inputClass} />
            <button onClick={() => { if(catName){ onAddCat(catName); setCatName(''); } }} className="bg-slate-900 text-white px-4 rounded-lg hover:bg-slate-800 transition"><Plus size={18} /></button>
          </div>
          <div className="space-y-2 max-h-40 overflow-auto divide-y divide-slate-50">
            {state.categories.map(c => (
              <div key={c.id} className="flex justify-between items-center py-2 text-sm">
                <span>{c.name}</span>
                <button onClick={() => onDelCat(c.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-amber-600"><Users size={18} /> Funcionários</h3>
          <div className="space-y-3 mb-4">
            <input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Nome completo" className={inputClass + " w-full"} />
            <div className="flex gap-2">
              <select value={empCatId} onChange={e => setEmpCatId(e.target.value)} className={selectClass}>
                <option value="">Selecione a Categoria</option>
                {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg text-[10px] font-bold cursor-pointer uppercase text-slate-600">
                <input type="checkbox" checked={empRestricted} onChange={e => setEmpRestricted(e.target.checked)} /> Restrição
              </label>
            </div>
            <button onClick={() => { if(empName && empCatId){ onAddEmp(empName, empCatId, empRestricted); setEmpName(''); setEmpCatId(''); setEmpRestricted(false); } }} className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-bold hover:bg-slate-800 transition">Adicionar Funcionário</button>
          </div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {state.employees.map(e => (
              <div key={e.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg text-sm border border-slate-100 hover:border-slate-200 transition">
                <span className="flex items-center gap-2 font-medium">{e.name} {e.isRestricted && <ShieldAlert size={14} className="text-red-500" />}</span>
                <button onClick={() => onDelEmp(e.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-600"><Building2 size={18} /> Ambientes</h3>
          <div className="space-y-3 mb-4">
            <input value={envName} onChange={e => setEnvName(e.target.value)} placeholder="Nome do ambiente" className={inputClass + " w-full"} />
            <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pessoas por Categoria:</p>
              {state.categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{cat.name}</span>
                  <input type="number" min="0" value={envReqs[cat.id] || 0} onChange={e => setEnvReqs({ ...envReqs, [cat.id]: parseInt(e.target.value) || 0 })} className="w-16 border rounded px-2 py-1 text-center font-bold" />
                </div>
              ))}
            </div>
            <button onClick={() => { if(envName){ onAddEnv(envName, envReqs); setEnvName(''); setEnvReqs({}); } }} className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-bold hover:bg-slate-800 transition">Salvar Ambiente</button>
          </div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {state.environments.map(env => (
              <div key={env.id} className="p-3 bg-slate-50 rounded-lg text-sm flex justify-between border border-slate-100">
                <span className="font-bold">{env.name}</span>
                <button onClick={() => onDelEnv(env.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-purple-600"><CalendarDays size={18} /> Datas Especiais</h3>
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              <input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} className={inputClass} />
              <select value={dayType} onChange={e => setDayType(e.target.value as any)} className={selectClass}>
                <option value="holiday">Feriado</option>
                <option value="sunday">Domingo</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input value={dayName} onChange={e => setDayName(e.target.value)} placeholder="Descrição do feriado" className={inputClass} />
              <button onClick={() => { if(dayDate && dayName){ onAddDay(dayDate, dayName, dayType); setDayDate(''); setDayName(''); } }} className="bg-slate-900 text-white px-4 rounded-lg hover:bg-slate-800 transition"><Plus size={18} /></button>
            </div>
          </div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {state.specialDays.map(d => (
              <div key={d.date} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg text-xs border border-slate-100">
                <span><b className="text-slate-900">{d.date}</b> - {d.name}</span>
                <button onClick={() => onDelDay(d.date)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CalendarView: React.FC<{ state: AppState; currentMonth: string; onMonthChange: (o: number) => void; onSwap: (d: string, o: string, n: string) => void; onGenerate: () => void; loading: boolean; }> = ({ state, currentMonth, onMonthChange, onSwap, onGenerate, loading }) => {
  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const currentSchedule = state.schedules[currentMonth] || [];

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const special = state.specialDays.find(sd => sd.date === dateStr);
    const entries = currentSchedule.filter(s => s.date === dateStr);
    return { d, dateStr, special, entries };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold capitalize text-slate-800">{monthName}</h2>
        <div className="flex gap-2">
          <button onClick={() => onMonthChange(-1)} className="p-2 border bg-white rounded-lg hover:bg-slate-50 transition"><ChevronLeft size={20} /></button>
          <button onClick={() => onMonthChange(1)} className="p-2 border bg-white rounded-lg hover:bg-slate-50 transition"><ChevronRight size={20} /></button>
          <button onClick={onGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-md disabled:opacity-50">
            {loading ? <RotateCw className="animate-spin" /> : <CalendarCheck />} Gerar IA
          </button>
        </div>
      </header>
      {currentSchedule.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center text-slate-400">
           <CalendarDays size={48} className="mx-auto mb-4 opacity-20" />
           <p className="text-lg font-medium">Nenhuma escala para este mês.</p>
           <p className="text-sm">Clique em "Gerar IA" para criar a sugestão automaticamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {days.map(day => (
            <div key={day.dateStr} className={`bg-white p-4 rounded-xl border ${day.special ? 'border-red-200 bg-red-50/20' : 'border-slate-200 shadow-sm'} hover:shadow-md transition`}>
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-lg text-slate-900">{day.d}</span>
                {day.special && <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase tracking-tighter">{day.special.name}</span>}
              </div>
              <div className="space-y-2">
                {day.entries.map(entry => {
                  const emp = state.employees.find(e => e.id === entry.employeeId);
                  const env = state.environments.find(e => e.id === entry.environmentId);
                  return (
                    <div key={entry.employeeId + entry.environmentId} className="p-2.5 border border-slate-100 rounded-lg text-[10px] bg-slate-50/50">
                      <div className="flex justify-between items-center font-bold text-slate-800 gap-2 mb-1">
                        <span className="truncate">{emp?.name || '---'}</span>
                        <select 
                          onChange={(e) => onSwap(day.dateStr, entry.employeeId, e.target.value)} 
                          className="text-blue-500 bg-transparent border-none p-0 cursor-pointer focus:ring-0 text-[9px] font-black uppercase"
                          value={entry.employeeId}
                        >
                          <option value={entry.employeeId}>Alt</option>
                          {state.employees
                            .filter(e => e.categoryId === entry.categoryId && e.id !== entry.employeeId)
                            .map(e => <option key={e.id} value={e.id}>{e.name}</option>)
                          }
                        </select>
                      </div>
                      <div className="text-slate-400 flex items-center gap-1"><Building2 size={8} /> {env?.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EmployeesList: React.FC<{ state: AppState; currentMonth: string }> = ({ state, currentMonth }) => {
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let list = state.employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [state.employees, search, sortOrder]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Colaboradores</h2>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por nome..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button 
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-2 border border-slate-200 bg-white rounded-xl shadow-sm hover:bg-slate-50 transition"
          >
            {sortOrder === 'asc' ? <ArrowDownAz size={20} /> : <ArrowUpAz size={20} />}
          </button>
        </div>
      </header>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-4 font-bold text-slate-600 uppercase text-[10px] tracking-widest">Colaborador</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[10px] tracking-widest">Categoria</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[10px] tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-slate-400 italic">Nenhum funcionário encontrado.</td>
                </tr>
              ) : (
                filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                          {emp.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {emp.name}
                          {emp.isRestricted && <ShieldAlert size={14} className="inline ml-2 text-red-500" />}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase border border-slate-200">
                        {state.categories.find(c => c.id === emp.categoryId)?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="p-4">
                      {emp.isRestricted ? (
                        <span className="text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 font-bold text-[9px] uppercase tracking-tighter">Com Restrição</span>
                      ) : (
                        <span className="text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 font-bold text-[9px] uppercase tracking-tighter">Padrão</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
