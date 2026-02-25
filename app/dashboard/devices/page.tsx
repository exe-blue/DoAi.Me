"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Smartphone, Search, RefreshCw, Battery, Wifi, WifiOff,
  Shield, User, X, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface Device {
  id: string; serial_number: string; pc_id: string; status: string;
  model: string|null; battery_level: number|null; last_seen_at: string|null;
  ip_intranet: string|null; proxy?: string|null; account_id?: string|null;
  xiaowei_serial?: string|null; android_version?: string|null;
  youtube_version?: string|null; tag_group?: string|null;
}

interface Worker { id: string; pc_number?: string; hostname?: string; }

function cn(...c: (string|false|undefined)[]) { return c.filter(Boolean).join(" "); }
function timeSince(d: string|null|undefined): string {
  if(!d) return "—";
  const s=Math.round((Date.now()-new Date(d).getTime())/1000);
  if(s<60) return `${s}초 전`;
  if(s<3600) return `${Math.floor(s/60)}분 전`;
  if(s<86400) return `${Math.floor(s/3600)}시간 전`;
  return `${Math.floor(s/86400)}일 전`;
}

const STATUS: Record<string,{color:string;label:string}> = {
  online: { color:"bg-green-500", label:"온라인" },
  busy:   { color:"bg-blue-500",  label:"작업중" },
  offline:{ color:"bg-slate-600", label:"오프라인" },
  error:  { color:"bg-red-500",   label:"에러" },
};

export default function DevicesPage() {
  const searchParams = useSearchParams();
  const pcFilter = searchParams.get("pc") || "all";

  const [devices, setDevices] = useState<Device[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pcSelect, setPcSelect] = useState(pcFilter);
  const [selected, setSelected] = useState<Device|null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/devices").then(r=>r.json()),
      fetch("/api/workers").then(r=>r.json()),
    ]).then(([d,w]) => {
      setDevices(Array.isArray(d)?d:d.data||[]);
      setWorkers(Array.isArray(w)?w:w.data||[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const pcName = (pcId: string) => {
    const w = workers.find(w=>w.id===pcId);
    return w?.pc_number || w?.hostname || pcId?.substring(0,6);
  };

  const filtered = devices.filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (pcSelect !== "all" && d.pc_id !== pcSelect) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.serial_number?.toLowerCase().includes(q)
        || d.model?.toLowerCase().includes(q)
        || d.ip_intranet?.toLowerCase().includes(q)
        || pcName(d.pc_id)?.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    total: devices.length,
    online: devices.filter(d=>d.status==="online").length,
    busy: devices.filter(d=>d.status==="busy").length,
    offline: devices.filter(d=>d.status==="offline").length,
    error: devices.filter(d=>d.status==="error").length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">디바이스</h1>
          <p className="text-sm text-slate-500">{counts.total}대 등록</p>
        </div>
        <div className="flex gap-1.5">
          {Object.entries(STATUS).map(([k,v]) => (
            <span key={k} className="flex items-center gap-1 rounded-full border border-[#1e2130] bg-[#12141d] px-2.5 py-1 text-[10px]">
              <span className={cn("h-1.5 w-1.5 rounded-full",v.color)}/>
              <span className="text-slate-500">{v.label}</span>
              <span className="font-mono text-slate-300">{counts[k as keyof typeof counts]||0}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/>
          <Input placeholder="시리얼, 모델, IP, PC 검색..." value={search} onChange={e=>setSearch(e.target.value)}
            className="border-[#1e2130] bg-[#12141d] pl-9 text-sm text-slate-300 placeholder:text-slate-600"/>
        </div>
        <Select value={pcSelect} onValueChange={setPcSelect}>
          <SelectTrigger className="w-32 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"><SelectValue placeholder="PC"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 PC</SelectItem>
            {workers.map(w=><SelectItem key={w.id} value={w.id}>{w.pc_number||w.hostname}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="online">온라인</SelectItem>
            <SelectItem value="busy">작업중</SelectItem>
            <SelectItem value="offline">오프라인</SelectItem>
            <SelectItem value="error">에러</SelectItem>
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
                <th className="px-4 py-3">시리얼</th>
                <th className="px-4 py-3">PC</th>
                <th className="px-4 py-3">모델</th>
                <th className="px-4 py-3">프록시</th>
                <th className="px-4 py-3">배터리</th>
                <th className="px-4 py-3">마지막 응답</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const st = STATUS[d.status] || { color:"bg-slate-600", label:d.status };
                return (
                  <tr key={d.id} onClick={()=>setSelected(d)}
                    className="border-b border-[#1e2130]/50 hover:bg-[#1a1d2e]/30 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full",st.color)}/>
                        <span className="text-xs text-slate-400">{st.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{d.serial_number}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{pcName(d.pc_id)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{d.model||"—"}</td>
                    <td className="px-4 py-2.5">
                      {d.proxy ? (
                        <span className="flex items-center gap-1 text-xs text-green-400"><Shield className="h-3 w-3"/> 연결</span>
                      ) : (
                        <span className="text-xs text-slate-600">없음</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.battery_level!=null ? (
                        <span className={cn("flex items-center gap-1 text-xs",d.battery_level<20?"text-red-400":"text-slate-400")}>
                          <Battery className="h-3 w-3"/>{d.battery_level}%
                        </span>
                      ) : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{timeSince(d.last_seen_at)}</td>
                  </tr>
                );
              })}
              {filtered.length===0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-600">검색 결과 없음</td></tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-[#1e2130] px-4 py-2 text-xs text-slate-500">
            {filtered.length}개 표시 / {devices.length}개 전체
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={()=>setSelected(null)}>
        <SheetContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 w-[400px] sm:w-[440px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-2">
                  <Smartphone className="h-5 w-5"/>
                  {selected.serial_number}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <DetailRow label="상태" value={
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full",STATUS[selected.status]?.color||"bg-slate-600")}/>
                    {STATUS[selected.status]?.label||selected.status}
                  </span>
                }/>
                <DetailRow label="PC" value={pcName(selected.pc_id)}/>
                <DetailRow label="모델" value={selected.model||"—"}/>
                <DetailRow label="시리얼" value={<span className="font-mono text-[11px]">{selected.serial_number}</span>}/>
                <DetailRow label="IP" value={<span className="font-mono text-[11px]">{selected.ip_intranet||"—"}</span>}/>
                <DetailRow label="배터리" value={selected.battery_level!=null?`${selected.battery_level}%`:"—"}/>
                <DetailRow label="Android" value={selected.android_version||"—"}/>
                <DetailRow label="YouTube" value={selected.youtube_version||"—"}/>
                <DetailRow label="Xiaowei" value={selected.xiaowei_serial||"—"}/>
                <DetailRow label="태그" value={selected.tag_group||"—"}/>
                <DetailRow label="프록시" value={selected.proxy||"없음"}/>
                <DetailRow label="마지막 응답" value={timeSince(selected.last_seen_at)}/>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#1e2130] pb-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}
