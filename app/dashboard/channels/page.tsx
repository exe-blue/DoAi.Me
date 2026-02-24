"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tv, Plus, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "music" | "tech" | "gaming" | "entertainment" | "education" | "other";

interface Channel {
  id: string;
  name: string;
  profile_url?: string;
  category?: Category;
  video_count?: number;
  thumbnail_url?: string;
  is_monitored?: boolean;
}

interface Video {
  id: string;
  channel_id: string;
  title: string;
  priority?: string | number;
  completed_views?: number;
  duration?: string;
  status?: string;
}

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const categoryLabels: Record<Category, string> = {
  music: "음악",
  tech: "기술",
  gaming: "게임",
  entertainment: "엔터테인먼트",
  education: "교육",
  other: "기타"
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

  // Channel form state
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", youtube_url: "", category: "other" as Category, notes: "" });

  // Video form state
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoForm, setVideoForm] = useState({ title: "", youtube_url: "" });

  // Bulk video form state
  const [bulkVideoDialogOpen, setBulkVideoDialogOpen] = useState(false);
  const [bulkVideoUrls, setBulkVideoUrls] = useState("");

  // Delete confirmation state
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);
  const [deleteVideoIds, setDeleteVideoIds] = useState<string[]>([]);

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedChannelId) {
      loadVideos(selectedChannelId);
    }
  }, [selectedChannelId]);

  async function loadChannels() {
    try {
      setLoading(true);
      const res = await fetch("/api/channels");
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (error) {
      console.error("Failed to load channels:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadVideos(channelId: string) {
    try {
      const res = await fetch(`/api/channels/${channelId}/videos`);
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (error) {
      console.error("Failed to load videos:", error);
    }
  }

  async function createChannel() {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channelForm)
      });
      if (res.ok) {
        setChannelDialogOpen(false);
        setChannelForm({ name: "", youtube_url: "", category: "other", notes: "" });
        loadChannels();
      }
    } catch (error) {
      console.error("Failed to create channel:", error);
    }
  }

  async function deleteChannel(id: string) {
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      if (res.ok) {
        if (selectedChannelId === id) {
          setSelectedChannelId(null);
          setVideos([]);
        }
        loadChannels();
      }
    } catch (error) {
      console.error("Failed to delete channel:", error);
    } finally {
      setDeleteChannelId(null);
    }
  }

  async function createVideo() {
    if (!selectedChannelId) return;

    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: videoForm.title,
          youtube_url: videoForm.youtube_url
        })
      });
      if (res.ok) {
        setVideoDialogOpen(false);
        setVideoForm({ title: "", youtube_url: "" });
        loadVideos(selectedChannelId);
      }
    } catch (error) {
      console.error("Failed to create video:", error);
    }
  }

  async function createBulkVideos() {
    if (!selectedChannelId) return;

    const urls = bulkVideoUrls.split("\n").filter(url => url.trim());
    const bulk = urls.map(url => ({
      youtube_url: url.trim(),
      title: url.trim() // placeholder; API extracts video id from URL
    }));

    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk })
      });
      if (res.ok) {
        setBulkVideoDialogOpen(false);
        setBulkVideoUrls("");
        loadVideos(selectedChannelId);
      }
    } catch (error) {
      console.error("Failed to create bulk videos:", error);
    }
  }

  async function updateVideoPriority(videoId: string, priority: string) {
    if (!selectedChannelId) return;

    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/videos/${videoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority })
      });
      if (res.ok) {
        loadVideos(selectedChannelId);
      }
    } catch (error) {
      console.error("Failed to update video priority:", error);
    }
  }

  async function updateVideoActive(videoId: string, active: boolean) {
    if (!selectedChannelId) return;

    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/videos/${videoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: active ? "active" : "paused" })
      });
      if (res.ok) {
        loadVideos(selectedChannelId);
      }
    } catch (error) {
      console.error("Failed to update video status:", error);
    }
  }

  async function deleteSelectedVideos() {
    if (!selectedChannelId || deleteVideoIds.length === 0) return;

    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/videos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteVideoIds })
      });
      if (res.ok) {
        setSelectedVideos(new Set());
        loadVideos(selectedChannelId);
      }
    } catch (error) {
      console.error("Failed to delete videos:", error);
    } finally {
      setDeleteVideoIds([]);
    }
  }

  function toggleVideoSelection(videoId: string) {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  }

  function toggleAllVideos() {
    if (selectedVideos.size === videos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(videos.map(v => v.id)));
    }
  }

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">채널</h1>
        <p className="text-base text-muted-foreground">
          YouTube 채널 및 컨텐츠를 관리합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left Panel - Channels */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tv className="h-5 w-5 text-muted-foreground" />
                <CardTitle>채널 목록</CardTitle>
              </div>
              <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    채널 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>새 채널 추가</DialogTitle>
                    <DialogDescription>YouTube 채널 정보를 입력하세요.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="channel-name">채널명 *</Label>
                      <Input
                        id="channel-name"
                        value={channelForm.name}
                        onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                        placeholder="채널 이름"
                      />
                    </div>
                    <div>
                      <Label htmlFor="channel-url">YouTube URL</Label>
                      <Input
                        id="channel-url"
                        value={channelForm.youtube_url}
                        onChange={(e) => setChannelForm({ ...channelForm, youtube_url: e.target.value })}
                        placeholder="https://youtube.com/@channel"
                      />
                    </div>
                    <div>
                      <Label htmlFor="channel-category">카테고리</Label>
                      <Select
                        value={channelForm.category}
                        onValueChange={(value: Category) => setChannelForm({ ...channelForm, category: value })}
                      >
                        <SelectTrigger id="channel-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="channel-notes">메모</Label>
                      <Textarea
                        id="channel-notes"
                        value={channelForm.notes}
                        onChange={(e) => setChannelForm({ ...channelForm, notes: e.target.value })}
                        placeholder="채널 관련 메모"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setChannelDialogOpen(false)}>취소</Button>
                    <Button onClick={createChannel} disabled={!channelForm.name}>확인</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground">로딩 중...</p>
                ) : channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 채널이 없습니다.</p>
                ) : (
                  channels.map((channel) => (
                    <Card
                      key={channel.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-accent",
                        selectedChannelId === channel.id && "border-primary bg-accent"
                      )}
                      onClick={() => setSelectedChannelId(channel.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-sm truncate">{channel.name}</h3>
                              {channel.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {categoryLabels[channel.category]}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              동영상 {channel.video_count || 0}개
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteChannelId(channel.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Panel - Videos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedChannel ? `${selectedChannel.name} - 동영상` : "동영상 목록"}
              </CardTitle>
              <div className="flex gap-2">
                {selectedVideos.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteVideoIds(Array.from(selectedVideos))}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    선택 삭제 ({selectedVideos.size})
                  </Button>
                )}
                <Dialog open={bulkVideoDialogOpen} onOpenChange={setBulkVideoDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={!selectedChannelId}>
                      <Plus className="h-4 w-4 mr-1" />
                      일괄 추가
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>동영상 일괄 추가</DialogTitle>
                      <DialogDescription>YouTube URL을 한 줄에 하나씩 입력하세요.</DialogDescription>
                    </DialogHeader>
                    <Textarea
                      value={bulkVideoUrls}
                      onChange={(e) => setBulkVideoUrls(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      rows={10}
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBulkVideoDialogOpen(false)}>취소</Button>
                      <Button onClick={createBulkVideos} disabled={!bulkVideoUrls.trim()}>확인</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={!selectedChannelId}>
                      <Plus className="h-4 w-4 mr-1" />
                      동영상 추가
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>새 동영상 추가</DialogTitle>
                      <DialogDescription>YouTube 동영상 정보를 입력하세요.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="video-title">제목</Label>
                        <Input
                          id="video-title"
                          value={videoForm.title}
                          onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })}
                          placeholder="동영상 제목"
                        />
                      </div>
                      <div>
                        <Label htmlFor="video-url">YouTube URL *</Label>
                        <Input
                          id="video-url"
                          value={videoForm.youtube_url}
                          onChange={(e) => setVideoForm({ ...videoForm, youtube_url: e.target.value })}
                          placeholder="https://youtube.com/watch?v=..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setVideoDialogOpen(false)}>취소</Button>
                      <Button onClick={createVideo} disabled={!videoForm.youtube_url}>확인</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {!selectedChannelId ? (
                <p className="text-sm text-muted-foreground">채널을 선택하세요.</p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 동영상이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedVideos.size === videos.length && videos.length > 0}
                          onCheckedChange={toggleAllVideos}
                        />
                      </TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead className="w-20">우선순위</TableHead>
                      <TableHead className="w-20">재생수</TableHead>
                      <TableHead className="w-20">활성</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {videos.map((video) => (
                      <TableRow key={video.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedVideos.has(video.id)}
                            onCheckedChange={() => toggleVideoSelection(video.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">{video.title}</span>
                            <a
                              href={`https://www.youtube.com/watch?v=${video.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              https://www.youtube.com/watch?v={video.id}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={String(video.priority ?? "normal")}
                            onValueChange={(val) => updateVideoPriority(video.id, val)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">low</SelectItem>
                              <SelectItem value="normal">normal</SelectItem>
                              <SelectItem value="high">high</SelectItem>
                              <SelectItem value="urgent">urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {video.completed_views ?? 0}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={video.status === "active"}
                            onCheckedChange={(checked) => updateVideoActive(video.id, checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Channel Delete Confirmation */}
      <AlertDialog open={!!deleteChannelId} onOpenChange={(open) => !open && setDeleteChannelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>채널 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 채널을 삭제하시겠습니까?
              {deleteChannelId && channels.find(c => c.id === deleteChannelId)?.video_count
                ? ` ${channels.find(c => c.id === deleteChannelId)?.video_count}개의 동영상도 함께 삭제됩니다.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteChannelId && deleteChannel(deleteChannelId)}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Video Delete Confirmation */}
      <AlertDialog open={deleteVideoIds.length > 0} onOpenChange={(open) => !open && setDeleteVideoIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>동영상 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {deleteVideoIds.length}개의 동영상을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelectedVideos}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
