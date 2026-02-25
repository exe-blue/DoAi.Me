"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Smartphone, Eye, Heart, Zap, TrendingUp, TrendingDown,
  Server, RefreshCw, CheckCircle2, XCircle, Activity,
  AlertTriangle, ArrowRight, Clock,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

/* ════════════════ Types ════════════════ */
interface RealtimeData {
  totalDevices: number; online: number; offline: number; busy: number; error: number;
  activeMissions: number;
  todayStats: { views: number; errors: number; likes?: number; comments?: number };
  pcs: Array<{ pc_number: string; status: string; id: string }>;
}
interface Worker { id: string; hostname?: string; pc_number?: string; status: string; device_count?: number; online_count?: number; }
interface Task { id: string; title?: string; status: string; video_id?: string; device_count?: number; type?: string; }
interface ErrorItem { type: string; count: number; severity: string; lastOccurred: string; }

/* ════════════════ Helpers ════════════════ */
function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }
function fmt(n: number) { return n >= 10000 ? (n/1000).toFixed(1).replace(/\.0$/,"")+"K" : n.toLocaleString(); }

/* ════════════════ Stat Card ════════════════ */
function StatCard({ label, value, sub, color, pulse, icon: Icon }: {
  label: string; value: string; sub?: string;
  color: "green"|"blue"|"amber"|"red"; pulse?: boolean; icon: React.ElementType;
}) {
  const dot = { green:"bg-green-500", blue:"bg-blue-500", amber:"bg-amber-500", red:"bg-red-500" }[color];
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("h-2 w-2 rounded-full", dot, pulse && "animate-pulse")} />
        <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="font-mono text-[32px] font-bold leading-none text-white">{value}</span>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        <Icon className="h-7 w-7 text-slate-700" />
      </div>
    </div>
  );
}

/* ════════════════ Chart ════════════════ */
function ActivityChart({ data, tab, setTab }: { data: any[]; tab: string; setTab: (t:string)=>void }) {
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {["TODAY","WEEK","MONTH"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn("rounded px-3 py-1 text-[10px] font-bold tracking-wider",
                tab===t?"bg-blue-600 text-white":"text-slate-500 hover:text-slate-300")}>{t}</button>
          ))}
        </div>
        <div className="flex gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500"/>시청</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500"/>좋아요</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"/>댓글</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25}/>
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e2130" vertical={false}/>
          <XAxis dataKey="hour" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false} width={40}
            tickFormatter={(v:number)=>v>=1000?(v/1000)+"K":String(v)}/>
          <Tooltip contentStyle={{background:"#12141d",border:"1px solid #1e2130",borderRadius:8,fontFamily:"monospace",fontSize:11}}/>
          <Area type="monotone" dataKey="views" stroke="#22c55e" fill="url(#gV)" strokeWidth={2}/>
          <Area type="monotone" dataKey="likes" stroke="#3b82f6" fill="transparent" strokeWidth={1.5}/>
          <Area type="monotone" dataKey="comments" stroke="#f59e0b" fill="transparent" strokeWidth={1.5}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ════════════════ PC Status ════════════════ */
function WorkersPanel({ workers }: { workers: Worker[] }) {
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5 relative overflow-hidden">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-500"/>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">WORKERS</span>
          <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] text-green-400">
            {workers.filter(w=>w.status==="online").length} online
          </span>
        </div>
        <Link href="/dashboard/workers" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
          View All <ArrowRight className="h-3 w-3"/>
        </Link>
      </div>
      <div className="relative z-10 space-y-2">
        {workers.map(w=>{
          const name=w.pc_number||w.hostname||"PC??";
          const on=w.online_count||0, tot=w.device_count||100;
          const pct=tot>0?Math.round((on/tot)*100):0;
          return (
            <div key={w.id} className="flex items-center gap-3">
              <div className={cn("h-2 w-2 rounded-full",w.status==="online"?"bg-green-500":"bg-slate-600")}/>
              <span className="w-12 font-mono text-sm text-slate-300">{name}</span>
              <div className="flex-1 h-2 rounded-full bg-[#1e2130]">
                <div className="h-2 rounded-full bg-green-600 transition-all" style={{width:`${pct}%`}}/>
              </div>
              <span className="font-mono text-xs text-slate-400 w-14 text-right">{on}/{tot}</span>
            </div>
          );
        })}
        {workers.length===0&&<p className="py-4 text-center text-xs text-slate-600">연결된 PC 없음</p>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/robot-wireframe.gif" alt="" className="absolute -right-6 -bottom-6 h-44 w-44 opacity-[0.08] pointer-events-none"/>
    </div>
  );
}

/* ════════════════ Recent Tasks ════════════════ */
function TasksPanel({ tasks }: { tasks: Task[] }) {
  const icon = (s:string) => s==="completed"?<CheckCircle2 className="h-3.5 w-3.5 text-green-400"/>
    :s==="failed"?<XCircle className="h-3.5 w-3.5 text-red-400"/>
    :<Activity className="h-3.5 w-3.5 text-blue-400"/>;
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-500"/>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">RECENT TASKS</span>
        </div>
        <Link href="/dashboard/tasks" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
          View All <ArrowRight className="h-3 w-3"/>
        </Link>
      </div>
      <div className="space-y-2">
        {tasks.map(t=>(
          <div key={t.id} className="flex items-center gap-3 rounded-lg bg-[#0d1117]/50 px-3 py-2">
            {icon(t.status)}
            <span className="flex-1 text-sm text-slate-300 truncate">{t.title||t.video_id||t.id.substring(0,8)}</span>
            <span className={cn("text-[10px] font-mono",
              t.status==="completed"?"text-green-400":t.status==="failed"?"text-red-400":"text-blue-400")}>
              {t.status}
            </span>
          </div>
        ))}
        {tasks.length===0&&<p className="py-4 text-center text-xs text-slate-600">태스크 없음</p>}
      </div>
    </div>
  );
}

/* ════════════════ Right Panel ════════════════ */
function RightPanel({ data, health, errors }: { data: RealtimeData|null; health: boolean; errors: ErrorItem[] }) {
  const [time, setTime] = useState(new Date());
  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  const notifs = [
    ...errors.slice(0,3).map(e=>({
      title: e.type.toUpperCase(), desc: `${e.count}건 발생`,
      time: e.lastOccurred?new Date(e.lastOccurred).toLocaleTimeString("ko-KR"):"", color:"bg-red-500", tag:"ERR",
    })),
    ...(data?.todayStats?.views?[{ title:"TASK COMPLETED", desc:`오늘 ${fmt(data.todayStats.views)}건 시청`,
      time:"today", color:"bg-green-500", tag:"OK" }]:[]),
  ];

  return (
    <div className="w-80 shrink-0 border-l border-[#1e2130] bg-[#0f1117] hidden xl:flex flex-col overflow-y-auto">
      {/* Clock */}
      <div className="p-5 text-right border-b border-[#1e2130]">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          {time.toLocaleDateString("ko-KR",{weekday:"long"})}
        </div>
        <div className="text-xs text-slate-400">
          {time.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"})}
        </div>
        <div className="mt-1 font-mono text-5xl font-light text-white tracking-tight">
          {time.toLocaleTimeString("ko-KR",{hour12:false})}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full",health?"bg-green-500 animate-pulse":"bg-red-500")}/>
          <span className={cn("font-mono text-[10px]",health?"text-green-400":"text-red-400")}>
            {health?"System Nominal":"Issues Detected"}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">{notifs.length}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NOTIFICATIONS</span>
          </div>
          <button className="text-[9px] uppercase tracking-wider text-slate-600 hover:text-slate-400">CLEAR ALL</button>
        </div>
        {notifs.map((n,i)=>(
          <div key={i} className="rounded-lg border border-[#1e2130] bg-[#12141d] p-3">
            <div className="flex items-center gap-2">
              <div className={cn("h-1.5 w-1.5 rounded-full",n.color)}/>
              <span className="text-[10px] font-bold text-white">{n.title}</span>
              <span className={cn("rounded px-1 text-[8px]",n.tag==="ERR"?"bg-red-900/30 text-red-400":"bg-green-900/30 text-green-400")}>{n.tag}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{n.desc}</p>
            <p className="mt-0.5 text-[9px] text-slate-600">{n.time}</p>
          </div>
        ))}

        {/* Resources */}
        <div className="pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RESOURCES</span>
          <div className="mt-2 space-y-2">
            <ResRow label="DEVICES" value={`${data?.online||0} / ${data?.totalDevices||0}`} ok={(data?.online||0)>0}/>
            <ResRow label="ACTIVE TASKS" value={String(data?.activeMissions||0)} ok={(data?.activeMissions||0)>=0}/>
            <ResRow label="ERRORS TODAY" value={String(data?.todayStats?.errors||0)} ok={(data?.todayStats?.errors||0)<10}/>
          </div>
        </div>
      </div>

      {/* Wireframe decoration */}
      <div className="flex justify-center p-4 border-t border-[#1e2130]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/computer-wireframe.gif" alt="" className="h-24 w-24 opacity-25"/>
      </div>
    </div>
  );
}

function ResRow({label,value,ok}:{label:string;value:string;ok:boolean}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#1e2130] bg-[#0d1117] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className={cn("h-1.5 w-1.5 rounded-full",ok?"bg-green-500":"bg-amber-500")}/>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <span className="font-mono text-sm text-slate-300">{value}</span>
    </div>
  );
}

/* ════════════════ Chart Data ════════════════ */
function genChart() {
  const h=new Date().getHours();
  return Array.from({length:24},(_,i)=>({
    hour:String(i).padStart(2,"0")+":00",
    views:i<=h?Math.floor(Math.random()*800+200):0,
    likes:i<=h?Math.floor(Math.random()*200+50):0,
    comments:i<=h?Math.floor(Math.random()*50+10):0,
  }));
}

/* ════════════════ Main ════════════════ */
export default function DashboardPage() {
  const [data, setData] = useState<RealtimeData|null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [health, setHealth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [chartData] = useState(genChart);
  const [chartTab, setChartTab] = useState("TODAY");

  const fetchAll = useCallback(async()=>{
    try {
      const [rt,w,h,t,e] = await Promise.all([
        fetch("/api/dashboard/realtime").then(r=>r.json()),
        fetch("/api/workers").then(r=>r.json()),
        fetch("/api/health").then(r=>r.json()),
        fetch("/api/tasks").then(r=>r.json()).catch(()=>[]),
        fetch("/api/dashboard/errors?hours=24").then(r=>r.json()).catch(()=>({data:{errors:[]}})),
      ]);
      if(rt.data)setData(rt.data);
      setWorkers(Array.isArray(w)?w:w.data||[]);
      setHealth(h.status==="ok");
      const tList=Array.isArray(t)?t:t.data||[];
      setTasks(tList.slice(0,5));
      setErrors(e.data?.errors||[]);
      setLastUpdated(new Date());
    } catch{ setHealth(false); }
    finally{ setLoading(false); }
  },[]);

  useEffect(()=>{ fetchAll(); const t=setInterval(fetchAll,30000); return()=>clearInterval(t); },[fetchAll]);

  if(loading) {
    return (
      <div className="flex h-[calc(100vh-3rem)]">
        <div className="flex-1 p-6 space-y-5">
          <Skeleton className="h-8 w-40 bg-[#1e2130]"/>
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i=><Skeleton key={i} className="h-28 bg-[#1e2130] rounded-xl"/>)}</div>
          <Skeleton className="h-56 bg-[#1e2130] rounded-xl"/>
          <div className="grid grid-cols-2 gap-4"><Skeleton className="h-48 bg-[#1e2130] rounded-xl"/><Skeleton className="h-48 bg-[#1e2130] rounded-xl"/></div>
        </div>
        <div className="w-80 border-l border-[#1e2130] p-5 hidden xl:block">
          <Skeleton className="h-20 bg-[#1e2130] rounded-xl"/>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-[#1e2130] bg-[#12141d]">
              <Activity className="h-4 w-4 text-blue-400"/>
            </div>
            <h1 className="text-2xl font-bold text-white">Overview</h1>
          </div>
          <span className="font-mono text-[11px] text-slate-500">Last updated {lastUpdated.toLocaleTimeString("ko-KR",{hour12:false})}</span>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="ONLINE" value={`${data?.online||0}/${data?.totalDevices||0}`} sub={`${data?.offline||0} offline`} color="green" pulse icon={Smartphone}/>
          <StatCard label="VIEWS TODAY" value={fmt(data?.todayStats?.views||0)} color="blue" icon={Eye}/>
          <StatCard label="LIKES TODAY" value={fmt(data?.todayStats?.likes||0)} color="blue" icon={Heart}/>
          <StatCard label="TASKS RUNNING" value={String(data?.activeMissions||0)} color="amber" icon={Zap}/>
        </div>

        {/* Chart */}
        <ActivityChart data={chartData} tab={chartTab} setTab={setChartTab}/>

        {/* 2-Column */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WorkersPanel workers={workers}/>
          <TasksPanel tasks={tasks}/>
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel data={data} health={health} errors={errors}/>
    </div>
  );
}
