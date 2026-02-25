"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw, Search, AlertTriangle, Info, AlertOctagon, Bug } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface LogEntry {
  id: string; message?: string; level?: string; status?: string;
  device_id?: string; data?: any; details?: any; created_at?: string;
}

function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ")}

const LEVEL_STYLE: Record<string,{color:string;bg:string;icon:React.ElementType}> = {
  error: { color:"text-red-400", bg:"bg-red-900/20", icon:AlertOctagon },
  warn:  { color:"text-amber-400", bg:"bg-amber-900/20", icon:AlertTriangle },
  info:  { color:"text-primary", bg:"bg-primary/10", icon:Info },
  debug: { color:"text-slate-500", bg:"bg-slate-800", icon:Bug },
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = () => {
    const params = new URLSearchParams();
    if(search) params.set("search",search);
    if(levelFilter!=="all") params.set("level",levelFilter);
    params.set("limit","100");
    fetch(`/api/logs?${params}`).then(r=>r.json())
      .then(d=>setLogs(Array.isArray(d)?d:d.data||[]))
      .catch(()=>{}).finally(()=>setLoading(false));
  };

  useEffect(()=>{fetchLogs();},[search,levelFilter]);
  useEffect(()=>{
    if(!autoRefresh) return;
    const t=setInterval(fetchLogs,10000);
    return()=>clearInterval(t);
  },[autoRefresh,search,levelFilter]);

  const formatTime = (d:string|undefined) => {
    if(!d) return "";
    const dt=new Date(d);
    return dt.toLocaleTimeString("ko-KR",{hour12:false})+"."+String(dt.getMilliseconds()).padStart(3,"0");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">로그</h1>
          <p className="text-sm text-slate-500">{logs.length}개 표시</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)}
              className="rounded border-slate-600 bg-[#12141d]"/>
            자동 새로고침
          </label>
          <Button onClick={fetchLogs} variant="outline" size="sm"
            className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:text-white">
            <RefreshCw className="mr-1.5 h-3 w-3"/> 새로고침
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500"/>
          <Input placeholder="메시지, 디바이스 검색..." value={search} onChange={e=>setSearch(e.target.value)}
            className="h-8 border-[#1e2130] bg-[#12141d] pl-8 text-xs text-slate-300 font-mono"/>
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-24 border-[#1e2130] bg-[#12141d] text-xs text-slate-300"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="error">ERROR</SelectItem>
            <SelectItem value="warn">WARN</SelectItem>
            <SelectItem value="info">INFO</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log Table */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#0d1117] overflow-hidden">
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#0d1117] z-10">
                <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2 text-left w-20">시각</th>
                  <th className="px-3 py-2 text-left w-14">레벨</th>
                  <th className="px-3 py-2 text-left w-28">디바이스</th>
                  <th className="px-3 py-2 text-left">메시지</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {logs.map((l,i)=>{
                  const level = l.level || (l.status==="failed"?"error":"info");
                  const st = LEVEL_STYLE[level] || LEVEL_STYLE.info;
                  const Icon = st.icon;
                  return (
                    <tr key={l.id||i} className="border-b border-[#1e2130]/20 hover:bg-[#12141d]/50">
                      <td className="px-3 py-1 text-slate-600 whitespace-nowrap">{formatTime(l.created_at)}</td>
                      <td className="px-3 py-1">
                        <span className={cn("inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold",st.bg,st.color)}>
                          <Icon className="h-2.5 w-2.5"/>{level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-1 text-slate-500 truncate max-w-[110px]">{l.device_id||"—"}</td>
                      <td className="px-3 py-1 text-slate-400 truncate">{l.message||JSON.stringify(l.data)||"—"}</td>
                    </tr>
                  );
                })}
                {logs.length===0&&(
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-xs text-slate-600">로그 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
