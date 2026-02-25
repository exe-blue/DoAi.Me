"use client";

import { useEffect, useState } from "react";
import {
  Terminal, Play, RefreshCw, Smartphone, Clock, CheckCircle2,
  XCircle, ChevronDown, Search, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Preset {
  id: string; name: string; command?: string; description?: string;
  category?: string; config?: any;
}

interface CommandLog {
  id: string; action?: string; status?: string; message?: string;
  device_serial?: string; created_at?: string; data?: any; details?: any;
}

interface Device { id: string; serial_number: string; status: string; pc_id: string; }

function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ")}
function timeSince(d:string|null|undefined):string{
  if(!d)return"—";const s=Math.round((Date.now()-new Date(d).getTime())/1000);
  if(s<60)return`${s}초 전`;if(s<3600)return`${Math.floor(s/60)}분 전`;
  return`${Math.floor(s/3600)}시간 전`;
}

export default function ADBPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // Execute modal
  const [execOpen, setExecOpen] = useState(false);
  const [execPreset, setExecPreset] = useState<Preset|null>(null);
  const [execDevice, setExecDevice] = useState("all");
  const [execCustom, setExecCustom] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<string|null>(null);

  // Custom command
  const [customOpen, setCustomOpen] = useState(false);
  const [customCmd, setCustomCmd] = useState("");

  useEffect(()=>{
    Promise.all([
      fetch("/api/commands/presets").then(r=>r.json()).catch(()=>[]),
      fetch("/api/commands").then(r=>r.json()).catch(()=>[]),
      fetch("/api/devices").then(r=>r.json()).catch(()=>[]),
    ]).then(([p,l,d])=>{
      setPresets(Array.isArray(p)?p:p.data||[]);
      setLogs((Array.isArray(l)?l:l.data||[]).slice(0,20));
      setDevices((Array.isArray(d)?d:d.data||[]).filter((dv:Device)=>dv.status==="online"||dv.status==="busy"));
    }).finally(()=>setLoading(false));
  },[]);

  const openExec = (preset:Preset) => {
    setExecPreset(preset);
    setExecDevice("all");
    setExecResult(null);
    setExecOpen(true);
  };

  const handleExec = async () => {
    if(!execPreset) return;
    setExecLoading(true);setExecResult(null);
    try {
      const res = await fetch("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          command: execPreset.command || execPreset.config?.command || execPreset.name,
          device: execDevice,
          preset_id: execPreset.id,
        })});
      const data = await res.json();
      setExecResult(JSON.stringify(data,null,2));
      // Refresh logs
      const newLogs = await fetch("/api/commands").then(r=>r.json()).catch(()=>[]);
      setLogs((Array.isArray(newLogs)?newLogs:newLogs.data||[]).slice(0,20));
    } catch(e:any){setExecResult(`Error: ${e.message}`);}
    finally{setExecLoading(false);}
  };

  const handleCustomExec = async () => {
    if(!customCmd.trim()) return;
    setExecLoading(true);
    try {
      const res = await fetch("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({command:customCmd,device:execDevice})});
      const data = await res.json();
      setExecResult(JSON.stringify(data,null,2));
      const newLogs = await fetch("/api/commands").then(r=>r.json()).catch(()=>[]);
      setLogs((Array.isArray(newLogs)?newLogs:newLogs.data||[]).slice(0,20));
    } catch(e:any){setExecResult(`Error: ${e.message}`);}
    finally{setExecLoading(false);setCustomOpen(false);setCustomCmd("");}
  };

  if(loading) return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ADB 콘솔</h1>
          <p className="text-sm text-slate-500">{presets.length}개 프리셋 · {devices.length}대 온라인</p>
        </div>
        <Button onClick={()=>{setCustomOpen(true);setExecResult(null);setExecDevice("all");}} size="sm"
          className="bg-blue-600 hover:bg-blue-700">
          <Terminal className="mr-1.5 h-3.5 w-3.5"/> 커스텀 명령
        </Button>
      </div>

      {/* Preset Cards */}
      {presets.length>0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">프리셋</span>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {presets.map(p=>(
              <div key={p.id} className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4 hover:border-[#2a2d40] transition-colors group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/20">
                      <Terminal className="h-4 w-4 text-emerald-400"/>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      {p.category&&<span className="text-[9px] uppercase tracking-wider text-slate-500">{p.category}</span>}
                    </div>
                  </div>
                  <Button onClick={()=>openExec(p)} size="sm" variant="outline"
                    className="h-7 border-emerald-900/30 bg-emerald-900/10 text-emerald-400 hover:bg-emerald-900/20 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="mr-1 h-3 w-3"/> 실행
                  </Button>
                </div>
                {p.description&&<p className="text-xs text-slate-500 line-clamp-1">{p.description}</p>}
                {(p.command||p.config?.command)&&(
                  <div className="mt-2 rounded-md bg-[#0d1117] px-2.5 py-1.5 font-mono text-[10px] text-slate-400 truncate">
                    $ {p.command||p.config?.command}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Logs */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">실행 이력</span>
        <div className="mt-2 rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          {logs.length===0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-600">실행 이력 없음</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-2.5 text-left">상태</th>
                  <th className="px-4 py-2.5 text-left">명령</th>
                  <th className="px-4 py-2.5 text-left">디바이스</th>
                  <th className="px-4 py-2.5 text-left">메시지</th>
                  <th className="px-4 py-2.5 text-left">시각</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l=>{
                  const ok=l.status==="completed"||l.status==="success";
                  return(
                    <tr key={l.id} className="border-b border-[#1e2130]/30 hover:bg-[#1a1d2e]/20">
                      <td className="px-4 py-2">
                        {ok?<CheckCircle2 className="h-3.5 w-3.5 text-green-400"/>:<XCircle className="h-3.5 w-3.5 text-red-400"/>}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-400 truncate max-w-[150px]">{l.action||l.data?._action||"—"}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{l.device_serial||"all"}</td>
                      <td className="px-4 py-2 text-slate-500 truncate max-w-[200px]">{l.message||"—"}</td>
                      <td className="px-4 py-2 text-slate-600">{timeSince(l.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Execute Preset Dialog */}
      <Dialog open={execOpen} onOpenChange={setExecOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Terminal className="h-4 w-4"/> {execPreset?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(execPreset?.command||execPreset?.config?.command)&&(
              <div className="rounded-md bg-[#0d1117] px-3 py-2 font-mono text-xs text-emerald-400">
                $ {execPreset.command||execPreset.config?.command}
              </div>
            )}
            <div>
              <span className="text-xs text-slate-400">대상 디바이스</span>
              <Select value={execDevice} onValueChange={setExecDevice}>
                <SelectTrigger className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 ({devices.length}대)</SelectItem>
                  {devices.slice(0,20).map(d=>(
                    <SelectItem key={d.id} value={d.serial_number}>{d.serial_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {execResult&&(
              <div className="rounded-md bg-[#0d1117] p-3 font-mono text-[10px] text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {execResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setExecOpen(false)} className="border-[#1e2130] text-slate-400">닫기</Button>
            <Button onClick={handleExec} disabled={execLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {execLoading?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Play className="mr-1.5 h-3.5 w-3.5"/>}
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Command Dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader><DialogTitle className="text-white">커스텀 ADB 명령</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-slate-400">대상 디바이스</span>
              <Select value={execDevice} onValueChange={setExecDevice}>
                <SelectTrigger className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 ({devices.length}대)</SelectItem>
                  {devices.slice(0,20).map(d=><SelectItem key={d.id} value={d.serial_number}>{d.serial_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-xs text-slate-400">ADB Shell 명령</span>
              <Input value={customCmd} onChange={e=>setCustomCmd(e.target.value)} placeholder="input tap 540 350"
                className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-emerald-400"/>
            </div>
            {execResult&&(
              <div className="rounded-md bg-[#0d1117] p-3 font-mono text-[10px] text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {execResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setCustomOpen(false)} className="border-[#1e2130] text-slate-400">닫기</Button>
            <Button onClick={handleCustomExec} disabled={execLoading||!customCmd.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {execLoading?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Send className="mr-1.5 h-3.5 w-3.5"/>}
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
