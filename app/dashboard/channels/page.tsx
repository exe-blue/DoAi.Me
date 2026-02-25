"use client";

import { useEffect, useState } from "react";
import {
  Tv, Plus, RefreshCw, ExternalLink, Eye, Video, Users,
  Clock, ChevronDown, ChevronUp, Trash2, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Channel {
  id: string; name: string; handle?: string|null; thumbnail_url?: string|null;
  subscriber_count?: string|null; video_count?: number; status?: string;
  is_monitored?: boolean; auto_collect?: boolean;
  last_collected_at?: string|null; created_at?: string;
}

interface ChannelVideo {
  id: string; title: string; status?: string; duration_sec?: number; target_views?: number; completed_views?: number;
}

function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ")}
function timeSince(d:string|null|undefined):string{
  if(!d)return "—";const s=Math.round((Date.now()-new Date(d).getTime())/1000);
  if(s<60)return`${s}초 전`;if(s<3600)return`${Math.floor(s/60)}분 전`;
  if(s<86400)return`${Math.floor(s/3600)}시간 전`;return`${Math.floor(s/86400)}일 전`;
}
function fmtSubs(s:string|null|undefined):string{
  if(!s)return"—";const n=parseInt(s);if(isNaN(n))return s;
  if(n>=10000)return(n/10000).toFixed(1)+"만";if(n>=1000)return(n/1000).toFixed(1)+"천";return String(n);
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [videos, setVideos] = useState<Record<string,ChannelVideo[]>>({});

  const fetchChannels = () => {
    setLoading(true);
    fetch("/api/channels").then(r=>r.json())
      .then(d=>setChannels(Array.isArray(d)?d:d.data||[]))
      .catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{fetchChannels();},[]);

  const handleSync = async () => {
    setSyncLoading(true);
    await fetch("/api/youtube/sync").catch(()=>{});
    setSyncLoading(false);
    fetchChannels();
  };

  const handleAdd = async () => {
    if(!addUrl.trim()) return;
    setAddLoading(true);
    await fetch("/api/youtube/channels",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({url:addUrl})}).catch(()=>{});
    setAddOpen(false);setAddUrl("");setAddLoading(false);
    fetchChannels();
  };

  const handleDelete = async (id:string) => {
    await fetch(`/api/channels/${id}`,{method:"DELETE"}).catch(()=>{});
    fetchChannels();
  };

  const toggleExpand = async (channelId:string) => {
    if(expanded===channelId){setExpanded(null);return;}
    setExpanded(channelId);
    if(!videos[channelId]){
      const res = await fetch(`/api/channels/${channelId}/videos`).then(r=>r.json()).catch(()=>[]);
      const list = Array.isArray(res)?res:res.data||[];
      setVideos(prev=>({...prev,[channelId]:list}));
    }
  };

  const monitored = channels.filter(c=>c.is_monitored);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">채널 관리</h1>
          <p className="text-sm text-slate-500">{channels.length}개 등록 · {monitored.length}개 모니터링</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} variant="outline" size="sm" disabled={syncLoading}
            className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:bg-[#1a1d2e] hover:text-white">
            {syncLoading?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<RefreshCw className="mr-1.5 h-3.5 w-3.5"/>}
            전체 동기화
          </Button>
          <Button onClick={()=>setAddOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-1.5 h-3.5 w-3.5"/> 채널 추가
          </Button>
        </div>
      </div>

      {/* Channel List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>
      ) : channels.length===0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Tv className="mx-auto h-8 w-8 text-slate-600"/>
          <p className="mt-3 text-sm text-slate-500">등록된 채널이 없습니다</p>
          <Button onClick={()=>setAddOpen(true)} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-1.5 h-3.5 w-3.5"/> 첫 채널 추가
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch=>{
            const isExpanded = expanded===ch.id;
            const chVideos = videos[ch.id]||[];
            return (
              <div key={ch.id} className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden hover:border-[#2a2d40] transition-colors">
                {/* Channel Row */}
                <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={()=>toggleExpand(ch.id)}>
                  {/* Thumbnail */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1a1d2e] overflow-hidden">
                    {ch.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.thumbnail_url} alt="" className="h-12 w-12 rounded-full object-cover"/>
                    ) : (
                      <Tv className="h-5 w-5 text-slate-500"/>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{ch.name}</span>
                      {ch.is_monitored && <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[8px] font-bold text-green-400">모니터링</span>}
                      {ch.auto_collect && <span className="rounded bg-blue-900/30 px-1.5 py-0.5 text-[8px] font-bold text-blue-400">자동수집</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      {ch.handle && <span>{ch.handle}</span>}
                      <span className="flex items-center gap-0.5"><Users className="h-3 w-3"/>{fmtSubs(ch.subscriber_count)}</span>
                      <span className="flex items-center gap-0.5"><Video className="h-3 w-3"/>{ch.video_count||0}개</span>
                      <span className="flex items-center gap-0.5"><Clock className="h-3 w-3"/>동기화 {timeSince(ch.last_collected_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button onClick={(e)=>{e.stopPropagation();handleDelete(ch.id);}}
                      className="rounded p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-900/10"><Trash2 className="h-3.5 w-3.5"/></button>
                    {isExpanded?<ChevronUp className="h-4 w-4 text-slate-500"/>:<ChevronDown className="h-4 w-4 text-slate-500"/>}
                  </div>
                </div>

                {/* Expanded: Videos */}
                {isExpanded && (
                  <div className="border-t border-[#1e2130] bg-[#0d1117] px-4 py-3">
                    {chVideos.length===0 ? (
                      <p className="py-4 text-center text-xs text-slate-600">영상 없음 — 동기화를 실행하세요</p>
                    ) : (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {chVideos.map(v=>{
                          const pct = (v.target_views&&v.target_views>0)?Math.min(100,Math.round(((v.completed_views||0)/v.target_views)*100)):0;
                          return (
                            <div key={v.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[#12141d]/50">
                              <div className={cn("h-1.5 w-1.5 rounded-full",
                                v.status==="active"?"bg-green-500":v.status==="completed"?"bg-blue-500":"bg-slate-600")}/>
                              <span className="flex-1 text-xs text-slate-300 truncate">{v.title}</span>
                              {v.duration_sec&&<span className="font-mono text-[10px] text-slate-500">{Math.round(v.duration_sec/60)}분</span>}
                              {v.target_views&&v.target_views>0 && (
                                <div className="flex items-center gap-1.5 w-20">
                                  <div className="flex-1 h-1 rounded-full bg-[#1e2130]">
                                    <div className="h-1 rounded-full bg-blue-600" style={{width:`${pct}%`}}/>
                                  </div>
                                  <span className="font-mono text-[9px] text-slate-500">{pct}%</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Channel Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader><DialogTitle className="text-white">채널 추가</DialogTitle></DialogHeader>
          <p className="text-xs text-slate-500">YouTube 채널 URL 또는 핸들을 입력하세요</p>
          <Input value={addUrl} onChange={e=>setAddUrl(e.target.value)}
            placeholder="https://youtube.com/@channelname 또는 @handle"
            className="border-[#1e2130] bg-[#12141d] text-sm text-slate-300"/>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddOpen(false)} className="border-[#1e2130] text-slate-400">취소</Button>
            <Button onClick={handleAdd} disabled={addLoading} className="bg-blue-600 hover:bg-blue-700">
              {addLoading?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Plus className="mr-1.5 h-3.5 w-3.5"/>}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
