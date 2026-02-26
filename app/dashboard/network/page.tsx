"use client";

import { useEffect, useState } from "react";
import { Globe, RefreshCw, Shield, Smartphone, CheckCircle2, XCircle, Wifi, WifiOff, Server } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface ProxyHealth { total: number; active: number; invalid: number; unassigned: number; }
interface Device { id: string; serial: string; status: string; pc_id: string; ip_intranet?: string|null; }
interface Worker { id: string; pc_number?: string; hostname?: string; status: string; device_count?: number; online_count?: number; }

function cn(...c: (string|false|undefined)[]) { return c.filter(Boolean).join(" "); }

const PIE_COLORS = { active: "#22c55e", invalid: "#ef4444", unassigned: "#f59e0b", other: "#475569" };

export default function NetworkPage() {
  const [proxy, setProxy] = useState<ProxyHealth|null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [health, setHealth] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/proxies").then(r=>r.json()),
      fetch("/api/devices").then(r=>r.json()),
      fetch("/api/workers").then(r=>r.json()),
      fetch("/api/health").then(r=>r.json()),
    ]).then(([p,d,w,h]) => {
      setProxy(p.data||p);
      setDevices(Array.isArray(d)?d:d.data||[]);
      setWorkers(Array.isArray(w)?w:w.data||[]);
      setHealth(h.status==="ok");
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>;

  const proxyPie = [
    { name:"활성", value: proxy?.active||0, color: PIE_COLORS.active },
    { name:"무효", value: proxy?.invalid||0, color: PIE_COLORS.invalid },
    { name:"미할당", value: proxy?.unassigned||0, color: PIE_COLORS.unassigned },
  ].filter(d=>d.value>0);

  const devicesByStatus = [
    { name:"온라인", count: devices.filter(d=>d.status==="online").length, fill:"#22c55e" },
    { name:"작업중", count: devices.filter(d=>d.status==="busy").length, fill:"#3b82f6" },
    { name:"오프라인", count: devices.filter(d=>d.status==="offline").length, fill:"#475569" },
    { name:"에러", count: devices.filter(d=>d.status==="error").length, fill:"#ef4444" },
  ];

  const pcBars = workers.map(w => ({
    name: w.pc_number || w.hostname || "?",
    online: w.online_count || 0,
    total: w.device_count || 0,
    status: w.status,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">네트워크</h1>
        <p className="text-sm text-slate-500">프록시 · 디바이스 · 연결 상태 시각화</p>
      </div>

      {/* Row 1: 4 stat boxes */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatBox icon={Shield} label="프록시 전체" value={proxy?.total||0} color="blue"/>
        <StatBox icon={CheckCircle2} label="활성" value={proxy?.active||0} color="green"/>
        <StatBox icon={XCircle} label="무효" value={proxy?.invalid||0} color="red"/>
        <StatBox icon={Smartphone} label="디바이스" value={devices.length} color="blue"/>
      </div>

      {/* Row 2: Donut + Device status bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Proxy Donut */}
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-500"/>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">프록시 상태 분포</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={proxyPie} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                    {proxyPie.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:"#12141d",border:"1px solid #1e2130",borderRadius:8,fontSize:12}}
                    formatter={(v:number,n:string)=>[v+"개",n]}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {proxyPie.map(d=>(
                <div key={d.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded" style={{background:d.color}}/>
                  <span className="text-xs text-slate-400">{d.name}</span>
                  <span className="font-mono text-sm font-bold text-white">{d.value}</span>
                </div>
              ))}
              {proxyPie.length===0&&<p className="text-xs text-slate-600">프록시 없음</p>}
            </div>
          </div>
        </div>

        {/* Device Status Distribution */}
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-slate-500"/>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">디바이스 상태 분포</span>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={devicesByStatus} layout="vertical" margin={{left:10}}>
              <CartesianGrid stroke="#1e2130" horizontal={false}/>
              <XAxis type="number" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fill:"#94a3b8",fontSize:11}} axisLine={false} tickLine={false} width={55}/>
              <Tooltip contentStyle={{background:"#12141d",border:"1px solid #1e2130",borderRadius:8,fontSize:12}}/>
              <Bar dataKey="count" radius={[0,4,4,0]}>
                {devicesByStatus.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: PC Connection + System Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* PC Connection Bars */}
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500"/>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">PC별 연결 상태</span>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, pcBars.length * 40)}>
            <BarChart data={pcBars} layout="vertical" margin={{left:5}}>
              <CartesianGrid stroke="#1e2130" horizontal={false}/>
              <XAxis type="number" tick={{fill:"#475569",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fill:"#94a3b8",fontSize:11,fontFamily:"monospace"}} axisLine={false} tickLine={false} width={45}/>
              <Tooltip contentStyle={{background:"#12141d",border:"1px solid #1e2130",borderRadius:8,fontSize:12}}
                formatter={(v:number,n:string)=>[v+"대",n==="online"?"온라인":"전체"]}/>
              <Bar dataKey="total" fill="#1e2130" radius={[0,4,4,0]}/>
              <Bar dataKey="online" fill="#22c55e" radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* System Connection Health */}
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-500"/>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">시스템 연결</span>
          </div>
          <div className="space-y-3">
            <ConnRow label="Supabase DB" ok={health}/>
            <ConnRow label="Supabase Realtime" ok={health}/>
            <ConnRow label="Xiaowei WebSocket" ok={workers.some(w=>w.status==="online")} detail={`${workers.filter(w=>w.status==="online").length}/${workers.length} PC`}/>
            <ConnRow label="프록시 풀" ok={(proxy?.active||0)>0} detail={`${proxy?.active||0}/${proxy?.total||0} 활성`}/>
            <ConnRow label="디바이스" ok={devices.some(d=>d.status==="online")} detail={`${devices.filter(d=>d.status==="online").length}/${devices.length} 온라인`}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({icon:Icon,label,value,color}:{icon:React.ElementType;label:string;value:number;color:string}) {
  const bg={green:"bg-green-900/20",blue:"bg-primary/10",red:"bg-red-900/20",amber:"bg-amber-900/20"}[color]||"bg-slate-800";
  const txt={green:"text-green-400",blue:"text-primary",red:"text-red-400",amber:"text-amber-400"}[color]||"text-slate-400";
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg",bg)}>
          <Icon className={cn("h-5 w-5",txt)}/>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-white">{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function ConnRow({label,ok,detail}:{label:string;ok:boolean;detail?:string}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#1e2130] bg-[#0d1117] px-4 py-3">
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full",ok?"bg-green-500":"bg-red-500")}/>
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className={cn("font-mono text-xs",ok?"text-green-400":"text-red-400")}>
        {detail||(ok?"Connected":"Disconnected")}
      </span>
    </div>
  );
}
