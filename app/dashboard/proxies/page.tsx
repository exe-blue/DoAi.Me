"use client";

import { useEffect, useState } from "react";
import {
  Shield, Search, RefreshCw, Plus, Wand2, Activity,
  CheckCircle2, XCircle, AlertTriangle, Trash2, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Proxy {
  id: string; address: string; type: string; status: string;
  device_serial?: string|null; device_id?: string|null;
  fail_count?: number; last_checked?: string|null; last_error?: string|null;
  username?: string|null; provider?: string|null;
}

function cn(...c: (string|false|undefined)[]) { return c.filter(Boolean).join(" "); }
function timeSince(d: string|null|undefined): string {
  if(!d) return "—";
  const s=Math.round((Date.now()-new Date(d).getTime())/1000);
  if(s<60) return `${s}초 전`; if(s<3600) return `${Math.floor(s/60)}분 전`;
  if(s<86400) return `${Math.floor(s/3600)}시간 전`; return `${Math.floor(s/86400)}일 전`;
}

const ST: Record<string,{color:string;label:string;icon:React.ElementType}> = {
  active:  { color:"text-green-400", label:"활성",   icon:CheckCircle2 },
  valid:   { color:"text-green-400", label:"유효",   icon:CheckCircle2 },
  invalid: { color:"text-red-400",   label:"무효",   icon:XCircle },
  testing: { color:"text-amber-400", label:"테스트중", icon:Activity },
};

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [actionLoading, setActionLoading] = useState<string|null>(null);

  const fetchProxies = () => {
    setLoading(true);
    fetch("/api/proxies").then(r=>r.json())
      .then(d=>setProxies(Array.isArray(d)?d:d.data||[]))
      .catch(()=>{}).finally(()=>setLoading(false));
  };

  useEffect(()=>{ fetchProxies(); },[]);

  const filtered = proxies.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.address?.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q)
        || p.device_serial?.toLowerCase().includes(q) || p.provider?.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    total: proxies.length,
    active: proxies.filter(p=>p.status==="active"||p.status==="valid").length,
    invalid: proxies.filter(p=>p.status==="invalid").length,
    unassigned: proxies.filter(p=>!p.device_serial&&!p.device_id).length,
  };

  const handleBulkAdd = async () => {
    if(!bulkText.trim()) return;
    setActionLoading("bulk");
    await fetch("/api/proxies/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:bulkText})});
    setBulkOpen(false); setBulkText(""); setActionLoading(null);
    fetchProxies();
  };

  const handleAutoAssign = async () => {
    setActionLoading("assign");
    await fetch("/api/proxies/auto-assign",{method:"POST"});
    setActionLoading(null);
    fetchProxies();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/proxies/${id}`,{method:"DELETE"});
    fetchProxies();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">프록시</h1>
          <p className="text-sm text-slate-500">{counts.total}개 등록 · {counts.active} 활성 · {counts.unassigned} 미할당</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <MiniStat label="전체" value={counts.total} color="blue"/>
        <MiniStat label="활성" value={counts.active} color="green"/>
        <MiniStat label="무효" value={counts.invalid} color="red"/>
        <MiniStat label="미할당" value={counts.unassigned} color="amber"/>
      </div>

      {/* Action Bar */}
      <div className="flex gap-2">
        <Button onClick={()=>setBulkOpen(true)} variant="outline" size="sm"
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:bg-[#1a1d2e] hover:text-white">
          <Plus className="mr-1.5 h-3.5 w-3.5"/> 벌크 추가
        </Button>
        <Button onClick={handleAutoAssign} variant="outline" size="sm" disabled={actionLoading==="assign"}
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:bg-[#1a1d2e] hover:text-white">
          {actionLoading==="assign"?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Wand2 className="mr-1.5 h-3.5 w-3.5"/>}
          자동 할당
        </Button>
        <div className="flex-1"/>
        <div className="relative">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500"/>
          <Input placeholder="검색..." value={search} onChange={e=>setSearch(e.target.value)}
            className="h-8 w-56 border-[#1e2130] bg-[#12141d] pl-8 text-xs text-slate-300"/>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-24 border-[#1e2130] bg-[#12141d] text-xs text-slate-300"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="valid">유효</SelectItem>
            <SelectItem value="invalid">무효</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">호스트:포트</th>
                <th className="px-4 py-3">프로토콜</th>
                <th className="px-4 py-3">기기</th>
                <th className="px-4 py-3">실패</th>
                <th className="px-4 py-3">마지막 체크</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = ST[p.status] || { color:"text-slate-400", label:p.status, icon:AlertTriangle };
                const Icon = st.icon;
                return (
                  <tr key={p.id} className="border-b border-[#1e2130]/50 hover:bg-[#1a1d2e]/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={cn("flex items-center gap-1.5 text-xs",st.color)}>
                        <Icon className="h-3.5 w-3.5"/>{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.address}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-[#1a1d2e] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">{p.type||"http"}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{p.device_serial||<span className="text-slate-600">미할당</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("font-mono text-xs",
                        (p.fail_count||0)>=3?"text-red-400":(p.fail_count||0)>0?"text-amber-400":"text-slate-500"
                      )}>{p.fail_count||0}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{timeSince(p.last_checked)}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={()=>handleDelete(p.id)} className="rounded p-1 text-slate-600 hover:text-red-400 hover:bg-red-900/10">
                        <Trash2 className="h-3.5 w-3.5"/>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length===0&&(
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-600">프록시 없음</td></tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-[#1e2130] px-4 py-2 text-xs text-slate-500">
            {filtered.length}개 표시 / {proxies.length}개 전체
          </div>
        </div>
      )}

      {/* Bulk Add Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">프록시 벌크 추가</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">한 줄에 하나씩 입력. 형식: protocol://user:pass@host:port 또는 host:port</p>
          <Textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={8} placeholder={
            "socks5://user:pass@1.2.3.4:1080\nhttp://5.6.7.8:8080\n9.10.11.12:3128"
          } className="border-[#1e2130] bg-[#12141d] font-mono text-xs text-slate-300"/>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setBulkOpen(false)} className="border-[#1e2130] text-slate-400">취소</Button>
            <Button onClick={handleBulkAdd} disabled={actionLoading==="bulk"} className="bg-blue-600 hover:bg-blue-700">
              {actionLoading==="bulk"?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Plus className="mr-1.5 h-3.5 w-3.5"/>}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({label,value,color}:{label:string;value:number;color:string}) {
  const dot = {green:"bg-green-500",blue:"bg-blue-500",red:"bg-red-500",amber:"bg-amber-500"}[color]||"bg-slate-500";
  return (
    <div className="rounded-lg border border-[#1e2130] bg-[#12141d] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <span className={cn("h-1.5 w-1.5 rounded-full",dot)}/>{label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-white">{value}</div>
    </div>
  );
}
