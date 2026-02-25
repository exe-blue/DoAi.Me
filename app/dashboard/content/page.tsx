"use client";

import { useEffect, useState } from "react";
import {
  Upload, Plus, RefreshCw, Play, Eye, Heart, MessageSquare,
  Search, Trash2, ExternalLink, Target, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Video {
  id: string; title: string; channel_id?: string; channel_name?: string;
  thumbnail_url?: string|null; status: string; duration_sec?: number|null;
  target_views?: number|null; completed_views?: number|null;
  failed_views?: number|null; search_keyword?: string|null;
  prob_like?: number|null; prob_comment?: number|null; prob_subscribe?: number|null;
  priority?: string|null; created_at?: string;
}

function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ")}
const ST: Record<string,{color:string;label:string}> = {
  active:{color:"bg-green-500",label:"활성"}, paused:{color:"bg-amber-500",label:"일시정지"},
  completed:{color:"bg-blue-500",label:"완료"}, archived:{color:"bg-slate-600",label:"보관"},
};

export default function ContentPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  // Add form
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [targetViews, setTargetViews] = useState("100");
  const [watchDuration, setWatchDuration] = useState("60");
  const [probLike, setProbLike] = useState("15");
  const [probComment, setProbComment] = useState("5");
  const [addLoading, setAddLoading] = useState(false);

  const fetchVideos = () => {
    setLoading(true);
    fetch("/api/tasks").then(r=>r.json())
      .then(d=>{
        const list = Array.isArray(d)?d:d.data||[];
        setVideos(list);
      }).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{fetchVideos();},[]);

  const filtered = videos.filter(v=>{
    if(statusFilter!=="all"&&v.status!==statusFilter) return false;
    if(search){
      const q=search.toLowerCase();
      return v.title?.toLowerCase().includes(q)||v.id?.toLowerCase().includes(q)
        ||v.channel_name?.toLowerCase().includes(q)||v.search_keyword?.toLowerCase().includes(q);
    }
    return true;
  });

  const extractVideoId = (url:string):string => {
    try{
      const u=new URL(url);
      if(u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
      return u.searchParams.get("v")||url;
    }catch{ return url; }
  };

  const handleAdd = async () => {
    const vid = extractVideoId(videoUrl);
    if(!vid) return;
    setAddLoading(true);
    // Try to add via channel video endpoint or direct upsert
    await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        video_id: vid,
        type: "youtube",
        task_type: "view_farm",
        device_count: 20,
        payload: {
          title: videoTitle || vid,
          target_views: parseInt(targetViews)||100,
          watch_duration_sec: parseInt(watchDuration)||60,
          prob_like: parseInt(probLike)||15,
          prob_comment: parseInt(probComment)||5,
        },
      })}).catch(()=>{});
    setAddOpen(false);setVideoUrl("");setVideoTitle("");setAddLoading(false);
    fetchVideos();
  };

  const stats = {
    active: videos.filter(v=>v.status==="active"||v.status==="pending"||v.status==="running").length,
    completed: videos.filter(v=>v.status==="completed").length,
    total: videos.length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">콘텐츠</h1>
          <p className="text-sm text-slate-500">{stats.total}개 등록 · {stats.active} 활성 · {stats.completed} 완료</p>
        </div>
        <Button onClick={()=>setAddOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-1.5 h-3.5 w-3.5"/> 영상 등록
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/>
          <Input placeholder="제목, ID, 채널, 키워드 검색..." value={search} onChange={e=>setSearch(e.target.value)}
            className="border-[#1e2130] bg-[#12141d] pl-9 text-sm text-slate-300"/>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="paused">일시정지</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Video List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500"/></div>
      ) : filtered.length===0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-600"/>
          <p className="mt-3 text-sm text-slate-500">등록된 콘텐츠가 없습니다</p>
          <Button onClick={()=>setAddOpen(true)} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-1.5 h-3.5 w-3.5"/> 첫 영상 등록
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(v=>{
            const target=v.target_views||v.payload?.target_views||0;
            const done=v.completed_views||0;
            const pct=target>0?Math.min(100,Math.round((done/target)*100)):0;
            const st=ST[v.status]||{color:"bg-blue-500",label:v.status};
            const title = v.title || v.payload?.title || v.video_id || v.id?.substring(0,8);

            return (
              <div key={v.id} className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4 hover:border-[#2a2d40] transition-colors">
                <div className="flex items-center gap-4">
                  {/* Thumbnail / Icon */}
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-[#1a1d2e] overflow-hidden">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail_url} alt="" className="h-16 w-24 object-cover rounded-lg"/>
                    ) : (
                      <Play className="h-6 w-6 text-slate-500"/>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full",st.color)}/>
                      <span className="text-sm font-medium text-white truncate">{title}</span>
                      <span className="rounded bg-[#1a1d2e] px-1.5 py-0.5 text-[9px] text-slate-500">{st.label}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
                      {v.channel_name && <span>{v.channel_name}</span>}
                      {(v.duration_sec||v.payload?.watch_duration_sec)&&
                        <span>{Math.round((v.duration_sec||v.payload?.watch_duration_sec||60)/60)}분</span>}
                      <span className="flex items-center gap-0.5"><Eye className="h-3 w-3"/> 목표 {target}</span>
                      {(v.prob_like||v.payload?.prob_like)&&
                        <span className="flex items-center gap-0.5"><Heart className="h-3 w-3"/> {v.prob_like||v.payload?.prob_like}%</span>}
                      {(v.prob_comment||v.payload?.prob_comment)&&
                        <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3"/> {v.prob_comment||v.payload?.prob_comment}%</span>}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="w-36 text-right shrink-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-lg font-bold text-white">{pct}%</span>
                      {pct>=100&&<CheckCircle2 className="h-4 w-4 text-green-400"/>}
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-[#1e2130]">
                      <div className={cn("h-2 rounded-full transition-all",
                        pct>=100?"bg-green-600":pct>=50?"bg-blue-600":"bg-amber-600"
                      )} style={{width:`${pct}%`}}/>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">{done} / {target}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Video Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-white">영상 등록</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-slate-400">YouTube URL</Label>
              <Input value={videoUrl} onChange={e=>setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"/>
            </div>
            <div>
              <Label className="text-xs text-slate-400">제목 (선택)</Label>
              <Input value={videoTitle} onChange={e=>setVideoTitle(e.target.value)} placeholder="영상 제목"
                className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">목표 시청수</Label>
                <Input type="number" value={targetViews} onChange={e=>setTargetViews(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300 font-mono"/>
              </div>
              <div>
                <Label className="text-xs text-slate-400">시청 시간 (초)</Label>
                <Input type="number" value={watchDuration} onChange={e=>setWatchDuration(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300 font-mono"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">좋아요 확률 (%)</Label>
                <Input type="number" value={probLike} onChange={e=>setProbLike(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300 font-mono"/>
              </div>
              <div>
                <Label className="text-xs text-slate-400">댓글 확률 (%)</Label>
                <Input type="number" value={probComment} onChange={e=>setProbComment(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300 font-mono"/>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddOpen(false)} className="border-[#1e2130] text-slate-400">취소</Button>
            <Button onClick={handleAdd} disabled={addLoading||!videoUrl.trim()} className="bg-blue-600 hover:bg-blue-700">
              {addLoading?<RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Target className="mr-1.5 h-3.5 w-3.5"/>}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
