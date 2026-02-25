"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Smartphone, Eye, Heart, Zap, Server, RefreshCw, CheckCircle2,
  XCircle, Activity, AlertTriangle, ArrowRight, Clock, Wifi, Shield,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

/* ═══ Types ═══ */
interface RealtimeData {
  totalDevices:number;online:number;offline:number;busy:number;error:number;
  activeMissions:number;
  todayStats:{views:number;errors:number;likes?:number;comments?:number};
  pcs:Array<{pc_number:string;status:string;id:string}>;
}
interface Worker{id:string;hostname?:string;pc_number?:string;status:string;device_count?:number;online_count?:number;last_heartbeat?:string;ip_local?:string;xiaowei_connected?:boolean;}
interface Task{id:string;title?:string;video_id?:string;status:string;device_count?:number;type?:string;payload?:any;}
interface ErrorItem{type:string;count:number;severity:string;lastOccurred:string;}
function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ")}
function fmt(n:number){return n>=10000?(n/1000).toFixed(1).replace(/\.0$/,"")+"K":n.toLocaleString()}
function timeSince(d:string|null|undefined):string{if(!d)return"—";const s=Math.round((Date.now()-new Date(d).getTime())/1000);if(s<60)return`${s}초 전`;if(s<3600)return`${Math.floor(s/60)}분 전`;return`${Math.floor(s/3600)}시간 전`;}

/* ═══ Stat Card ═══ */
function StatCard({label,value,sub,color,pulse,icon:Icon}:{label:string;value:string;sub?:string;color:"green"|"blue"|"amber"|"red";pulse?:boolean;icon:React.ElementType}){
  const dot={green:"bg-green-500",blue:"bg-blue-500",amber:"bg-amber-500",red:"bg-red-500"}[color];
  return(
    <div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
      <div className="flex items-center gap-2 mb-3"><div className={cn("h-2 w-2 rounded-full",dot,pulse&&"animate-pulse")}/><span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</span></div>
      <div className="flex items-end justify-between"><div><span className="font-mono text-[32px] font-bold leading-none text-white">{value}</span>{sub&&<div className="mt-1 text-xs text-slate-500">{sub}</div>}</div><Icon className="h-7 w-7 text-slate-700"/></div>
    </div>);
}

/* ═══ Chart ═══ */
function ActivityChart({data,tab,setTab}:{data:any[];tab:string;setTab:(t:string)=>void}){
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
    <div className="mb-4 flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">MISSION ACTIVITY OVERVIEW</span>
      <div className="flex gap-1">{["TODAY","WEEK","MONTH"].map(t=><button key={t} onClick={()=>setTab(t)} className={cn("rounded px-3 py-1 text-[10px] font-bold tracking-wider",tab===t?"bg-primary text-white":"text-slate-500 hover:text-slate-300")}>{t}</button>)}</div>
    </div>
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs><linearGradient id="gV" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.25}/><stop offset="100%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid stroke="#1e2130" vertical={false}/><XAxis dataKey="hour" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false} width={40} tickFormatter={(v:number)=>v>=1000?(v/1000)+"K":String(v)}/>
        <Tooltip contentStyle={{background:"#12141d",border:"1px solid #1e2130",borderRadius:8,fontFamily:"monospace",fontSize:11}}/>
        <Area type="monotone" dataKey="views" stroke="#22c55e" fill="url(#gV)" strokeWidth={2}/><Area type="monotone" dataKey="likes" stroke="#f59e0b" fill="transparent" strokeWidth={1.5} strokeDasharray="5 3"/>
      </AreaChart>
    </ResponsiveContainer>
    <div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500"/>Successful</span><span className="flex items-center gap-1.5"><span className="h-2 w-4 border-t border-dashed border-amber-500"/>Failed</span></div>
  </div>);
}

/* ═══ Workers Panel ═══ */
function WorkersPanel({workers}:{workers:Worker[]}){
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5 relative overflow-hidden">
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Server className="h-4 w-4 text-slate-500"/><span className="text-xs font-bold uppercase tracking-wider text-slate-300">AGENT ALLOCATION</span><span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] text-green-400">{workers.filter(w=>w.status==="online").length} online</span></div>
      <Link href="/dashboard/workers" className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5">View All<ArrowRight className="h-3 w-3"/></Link></div>
    <div className="relative z-10 space-y-2.5">{workers.map(w=>{const name=w.pc_number||w.hostname||"PC??";const on=w.online_count||0,tot=w.device_count||100;const pct=tot>0?Math.round((on/tot)*100):0;
      return(<div key={w.id} className="flex items-center gap-3 rounded-lg bg-[#0d1117]/50 px-3 py-2"><div className={cn("h-2 w-2 rounded-full",w.status==="online"?"bg-green-500":"bg-slate-600")}/><span className="w-12 font-mono text-sm font-bold text-white">{name}</span><div className="flex-1 h-2 rounded-full bg-[#1e2130]"><div className="h-2 rounded-full bg-green-600 transition-all" style={{width:`${pct}%`}}/></div><span className="font-mono text-xs text-slate-400 w-14 text-right">{on}/{tot}</span></div>);
    })}{workers.length===0&&<p className="py-4 text-center text-xs text-slate-600">연결된 PC 없음</p>}</div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/robot-wireframe.gif" alt="" className="absolute -right-6 -bottom-6 h-44 w-44 opacity-[0.08] pointer-events-none"/>
  </div>);
}

/* ═══ Activity Log ═══ */
function ActivityLog({errors,data}:{errors:ErrorItem[];data:RealtimeData|null}){
  const logs=[
    ...(data?.todayStats?.views?[{dot:"bg-green-500",title:`${fmt(data.todayStats.views)} views completed`,time:"today",tag:"OK"}]:[]),
    ...errors.slice(0,4).map(e=>({dot:"bg-red-500",title:`${e.count}x ${e.type}`,time:e.lastOccurred?timeSince(e.lastOccurred):"",tag:"ERR"})),
  ];
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
    <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-slate-500"/><span className="text-xs font-bold uppercase tracking-wider text-slate-300">ACTIVITY LOG</span></div>
    <div className="space-y-3">{logs.map((l,i)=>(<div key={i} className="border-l-2 border-[#1e2130] pl-3 py-1">
      <div className="flex items-center gap-2"><div className={cn("h-1.5 w-1.5 rounded-full",l.dot)}/><span className="text-xs text-white">{l.title}</span>{l.tag==="ERR"&&<span className="rounded bg-red-900/30 px-1 text-[8px] text-red-400">ERR</span>}</div>
      <p className="mt-0.5 text-[10px] text-slate-600">{l.time}</p></div>))}
    {logs.length===0&&<p className="py-4 text-center text-xs text-slate-600">활동 없음</p>}</div>
  </div>);
}

/* ═══ Mission Information ═══ */
function MissionInfo({data}:{data:RealtimeData|null}){
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">MISSION INFORMATION</span>
    <div className="mt-4 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2"><div className="h-2 w-2 rounded-full bg-green-500"/><span className="text-xs font-bold text-white">Successful Missions</span></div>
      <InfoRow label="시청 완료" value={fmt(data?.todayStats?.views||0)}/><InfoRow label="좋아요" value={fmt(data?.todayStats?.likes||0)}/><InfoRow label="댓글" value={fmt(data?.todayStats?.comments||0)}/>
      <div className="my-3 border-t border-[#1e2130]"/>
      <div className="flex items-center gap-1.5 mb-2"><div className="h-2 w-2 rounded-full bg-red-500"/><span className="text-xs font-bold text-red-400">Failed Missions</span></div>
      <InfoRow label="에러" value={String(data?.todayStats?.errors||0)} red/>
    </div>
  </div>);
}
function InfoRow({label,value,red}:{label:string;value:string;red?:boolean}){
  return(<div className="flex items-center justify-between py-1"><span className="text-xs text-slate-400">{label}</span><span className={cn("font-mono text-sm font-bold",red?"text-red-400":"text-white")}>{value}</span></div>);
}

/* ═══ Worker Detail (기존 "워커 상세") ═══ */
function WorkerDetail({workers}:{workers:Worker[]}){
  const w=workers.find(w=>w.status==="online")||workers[0];
  if(!w) return null;
  const name=w.pc_number||w.hostname||"—";const on=w.online_count||0;const tot=w.device_count||0;const pct=tot>0?Math.round((on/tot)*100):0;
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
    <div className="flex items-center justify-between mb-4"><span className="text-xs font-bold uppercase tracking-wider text-slate-300">워커 상세</span><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold",w.status==="online"?"bg-green-900/30 text-green-400":"bg-slate-800 text-slate-500")}>{w.status==="online"?"온라인":"오프라인"}</span></div>
    <div className="grid grid-cols-2 gap-3 text-xs mb-4"><div><span className="text-slate-500">워커 이름</span><div className="font-mono font-bold text-white">{name}</div></div><div><span className="text-slate-500">IP 주소</span><div className="font-mono text-slate-300">{w.ip_local||"N/A"}</div></div>
      <div><span className="text-slate-500">기동 시간</span><div className="text-slate-300">{timeSince(w.last_heartbeat)}</div></div><div><span className="text-slate-500">마지막 하트비트</span><div className="text-slate-300">{timeSince(w.last_heartbeat)}</div></div></div>
    <div><span className="text-xs text-slate-500">디바이스 상태</span><div className="mt-1.5 h-3 rounded-full bg-[#1e2130] overflow-hidden flex"><div className="h-3 bg-green-600" style={{width:`${pct}%`}}/><div className="h-3 bg-primary" style={{width:"0%"}}/></div>
      <div className="mt-1 flex gap-3 text-[10px] text-slate-500"><span>{on} 온라인</span><span>0 사용중</span><span>0 에러</span><span>{tot-on} 오프라인</span></div></div>
  </div>);
}

/* ═══ System Health Report (기존 "시스템 건강 리포트") ═══ */
function SystemHealth({data,health}:{data:RealtimeData|null;health:boolean}){
  const uptimePct=health?100:0;
  return(<div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-5">
    <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-green-400"/><span className="text-xs font-bold uppercase tracking-wider text-slate-300">시스템 건강 리포트</span></div>
      <div className="flex gap-1">{["24h","7d","30d"].map(t=><button key={t} className="rounded px-2 py-0.5 text-[9px] text-slate-500 hover:text-slate-300">{t}</button>)}</div></div>
    <div className="mb-4"><div className="flex justify-between mb-1"><span className="text-xs text-slate-400">가동률</span><span className="font-mono text-lg font-bold text-green-400">{uptimePct}%</span></div><div className="h-2.5 rounded-full bg-[#1e2130]"><div className="h-2.5 rounded-full bg-green-500" style={{width:`${uptimePct}%`}}/></div></div>
    <div className="grid grid-cols-4 gap-3"><HealthStat icon={CheckCircle2} label="작업 완료" value={`${data?.todayStats?.views||0}`} color="green"/><HealthStat icon={Smartphone} label="디바이스 복구" value="0" color="blue"/><HealthStat icon={AlertTriangle} label="에이전트 재시작" value="0" color="red"/><HealthStat icon={Wifi} label="Xiaowei 연결 끊김" value="0" color="amber"/></div>
  </div>);
}
function HealthStat({icon:Icon,label,value,color}:{icon:React.ElementType;label:string;value:string;color:string}){
  const c={green:"text-green-400",blue:"text-primary",red:"text-red-400",amber:"text-amber-400"}[color]||"text-slate-400";
  return(<div className="text-center"><Icon className={cn("mx-auto h-4 w-4 mb-1",c)}/><div className="font-mono text-lg font-bold text-white">{value}</div><div className="text-[9px] text-slate-500">{label}</div></div>);
}

/* ═══ Right Panel (시계 + 알림 + GIF) ═══ */
function RightPanel({data,health,errors}:{data:RealtimeData|null;health:boolean;errors:ErrorItem[]}){
  const [time,setTime]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  // Device status KPI for right panel
  const online=data?.online||0,total=data?.totalDevices||0;
  const survivalPct=total>0?((online/total)*100).toFixed(1):"0";
  const tasks=data?.activeMissions||0;

  const notifs=[
    ...errors.slice(0,3).map(e=>({dot:"bg-red-500",title:e.type.toUpperCase(),desc:`${e.count}건 발생`,time:e.lastOccurred?timeSince(e.lastOccurred):"",tag:"ERR"})),
    ...(data?.todayStats?.views?[{dot:"bg-green-500",title:"TASK COMPLETED",desc:`오늘 ${fmt(data.todayStats.views)}건 시청`,time:"today",tag:"OK"}]:[]),
  ];

  return(
    <div className="w-80 shrink-0 border-l border-[#1e2130] bg-[#0a0e14] hidden xl:flex flex-col overflow-y-auto">
      {/* Clock - Seoul style */}
      <div className="p-5 border-b border-[#1e2130] text-center">
        <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500">
          <span>{time.toLocaleDateString("ko-KR",{weekday:"long"})}</span>
          <span>{time.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"})}</span>
        </div>
        {/* Computer GIF behind clock */}
        <div className="relative my-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/computer-wireframe.gif" alt="" className="mx-auto h-16 w-16 opacity-20"/>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-4xl font-bold text-white tracking-tight">
              {time.toLocaleTimeString("ko-KR",{hour12:true,hour:"numeric",minute:"2-digit"})}
            </span>
          </div>
        </div>
        <div className="flex justify-center gap-4 text-[10px] font-mono text-slate-500">
          <span>Korea, Seoul</span><span>UTC+9</span>
        </div>
      </div>

      {/* Device Status KPI (SECURITY STATUS style) */}
      <div className="p-5 border-b border-[#1e2130] relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-green-500"/><span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">DEVICE STATUS</span></div>
          <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[9px] font-bold text-green-400">ONLINE</span>
        </div>
        <div className="relative z-10 space-y-2">
          <div className="rounded border border-green-900/30 bg-green-950/20 px-3 py-2"><div className="text-[9px] font-bold text-green-500">■ GUARD BOTS</div><div className="font-mono text-xl font-bold text-green-400">{online}/{total}</div><div className="text-[8px] text-green-600">[RUNNING...]</div></div>
          <div className="rounded border border-green-900/30 bg-green-950/20 px-3 py-2"><div className="text-[9px] font-bold text-green-500">■ SURVIVAL RATE</div><div className="font-mono text-xl font-bold text-green-400">{survivalPct}%</div><div className="text-[8px] text-green-600">[STABLE]</div></div>
          <div className="rounded border border-amber-900/30 bg-amber-950/20 px-3 py-2"><div className="text-[9px] font-bold text-amber-500">■ ACTIVE TASKS</div><div className="font-mono text-xl font-bold text-amber-400">{tasks}</div><div className="text-[8px] text-amber-600">[PROCESSING]</div></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/robot-wireframe.gif" alt="" className="absolute -right-4 -bottom-4 h-36 w-36 opacity-15 pointer-events-none"/>
      </div>

      {/* Notifications */}
      <div className="flex-1 p-5 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-4 w-4 items-center justify-center rounded bg-primary text-[9px] font-bold text-white">{notifs.length}</span><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NOTIFICATIONS</span></div><button className="text-[9px] uppercase tracking-wider text-slate-600 hover:text-slate-400">CLEAR ALL</button></div>
        {notifs.map((n,i)=>(<div key={i} className="rounded-lg border border-[#1e2130] bg-[#12141d] p-3"><div className="flex items-center gap-2"><div className={cn("h-1.5 w-1.5 rounded-full",n.dot)}/><span className="text-[10px] font-bold text-white">{n.title}</span><span className={cn("rounded px-1 text-[8px]",n.tag==="ERR"?"bg-red-900/30 text-red-400":"bg-green-900/30 text-green-400")}>{n.tag}</span></div><p className="mt-1 text-[11px] text-slate-500">{n.desc}</p><p className="mt-0.5 text-[9px] text-slate-600">{n.time}</p></div>))}
        <button className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 py-2">SHOW ALL ({notifs.length})</button>
      </div>

      {/* Bottom status */}
      <div className="border-t border-[#1e2130] px-5 py-3">
        <div className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5"><span className="flex h-4 w-4 items-center justify-center rounded bg-white/20 text-[9px] font-bold text-white">!</span><span className="text-[10px] font-bold text-white">SYSTEM NOMINAL</span><span className="ml-auto text-[10px] text-primary/70">+</span></div>
      </div>
    </div>
  );
}

/* ═══ Chart Data ═══ */
function genChart(){const h=new Date().getHours();return Array.from({length:24},(_,i)=>({hour:String(i).padStart(2,"0")+":00",views:i<=h?Math.floor(Math.random()*800+200):0,likes:i<=h?Math.floor(Math.random()*100+20):0}));}

/* ═══ Main Page ═══ */
export default function DashboardPage(){
  const[data,setData]=useState<RealtimeData|null>(null);const[workers,setWorkers]=useState<Worker[]>([]);const[errors,setErrors]=useState<ErrorItem[]>([]);const[health,setHealth]=useState(true);const[loading,setLoading]=useState(true);const[lastUpdated,setLastUpdated]=useState(new Date());const[chartData]=useState(genChart);const[chartTab,setChartTab]=useState("TODAY");

  const fetchAll=useCallback(async()=>{try{const[rt,w,h,e]=await Promise.all([fetch("/api/dashboard/realtime").then(r=>r.json()),fetch("/api/workers").then(r=>r.json()),fetch("/api/health").then(r=>r.json()),fetch("/api/dashboard/errors?hours=24").then(r=>r.json()).catch(()=>({data:{errors:[]}}))]);if(rt.data)setData(rt.data);setWorkers(Array.isArray(w)?w:w.data||[]);setHealth(h.status==="ok");setErrors(e.data?.errors||[]);setLastUpdated(new Date());}catch{setHealth(false);}finally{setLoading(false);}},[]);
  useEffect(()=>{fetchAll();const t=setInterval(fetchAll,30000);return()=>clearInterval(t);},[fetchAll]);

  if(loading)return(<div className="flex h-[calc(100vh-2.5rem)]"><div className="flex-1 p-6 space-y-4"><Skeleton className="h-8 w-48 bg-[#1e2130]"/><div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i=><Skeleton key={i} className="h-28 bg-[#1e2130] rounded-lg"/>)}</div><Skeleton className="h-56 bg-[#1e2130] rounded-lg"/></div><div className="w-80 border-l border-[#1e2130] p-5 hidden xl:block"><Skeleton className="h-20 bg-[#1e2130] rounded-lg"/></div></div>);

  return(
    <div className="flex h-[calc(100vh-2.5rem)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header - flush with breadcrumb */}
        <div className="flex items-center justify-between -mt-1"><span className="font-mono text-[11px] text-slate-500">LAST UPDATE: {lastUpdated.toLocaleDateString("ko-KR")} {lastUpdated.toLocaleTimeString("ko-KR",{hour12:false})}</span><div className="flex gap-2"><button onClick={fetchAll} className="rounded p-1.5 text-slate-500 hover:text-white hover:bg-[#1a1d2e]"><RefreshCw className="h-3.5 w-3.5"/></button></div></div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="ONLINE" value={`${data?.online||0}/${data?.totalDevices||0}`} sub={`${data?.offline||0} offline`} color="green" pulse icon={Smartphone}/>
          <StatCard label="VIEWS TODAY" value={fmt(data?.todayStats?.views||0)} color="blue" icon={Eye}/>
          <StatCard label="TASKS RUNNING" value={String(data?.activeMissions||0)} color="amber" icon={Zap}/>
          <StatCard label="PROXY STATUS" value={`0/0`} sub="0 invalid, 0 unassigned" color="blue" icon={Shield}/>
        </div>

        {/* Row: Workers + Activity Log */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WorkersPanel workers={workers}/>
          <ActivityLog errors={errors} data={data}/>
        </div>

        {/* Chart + Mission Info */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><ActivityChart data={chartData} tab={chartTab} setTab={setChartTab}/></div>
          <MissionInfo data={data}/>
        </div>

        {/* Worker Detail + System Health (기존 개요의 하단 섹션) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WorkerDetail workers={workers}/>
          <SystemHealth data={data} health={health}/>
        </div>
      </div>
      <RightPanel data={data} health={health} errors={errors}/>
    </div>
  );
}
