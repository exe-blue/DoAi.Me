"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  Shield,
  Smartphone,
  CheckCircle2,
  XCircle,
  Server,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ProxyHealth {
  total: number;
  active: number;
  invalid: number;
  unassigned: number;
}

interface Device {
  id: string;
  serial?: string;
  status?: string;
  worker_id?: string | null;
}

interface Worker {
  id: string;
  pc_number?: string;
  hostname?: string;
  status: string;
  device_count?: number;
  online_count?: number;
}

const PIE_COLORS = {
  active: "#22c55e",
  invalid: "#ef4444",
  unassigned: "#f59e0b",
};

function StatBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "green" | "blue" | "red" | "amber";
}) {
  const bg = {
    green: "bg-green-500/10",
    blue: "bg-primary/10",
    red: "bg-red-500/10",
    amber: "bg-amber-500/10",
  }[color];
  const txt = {
    green: "text-green-600 dark:text-green-400",
    blue: "text-primary",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[color];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-5 w-5", txt)} />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <div
          className={cn("h-2 w-2 rounded-full", ok ? "bg-green-500" : "bg-red-500")}
        />
        <span className="text-sm">{label}</span>
      </div>
      <span className={cn("font-mono text-xs", ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
        {detail ?? (ok ? "Connected" : "Disconnected")}
      </span>
    </div>
  );
}

export function NetworkContent() {
  const [proxy, setProxy] = useState<ProxyHealth | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [health, setHealth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setFetchError(null);
    Promise.all([
      fetch("/api/dashboard/proxies").then((r) => r.json()),
      fetch("/api/devices?pageSize=500").then((r) => r.json()),
      fetch("/api/workers").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
    ])
      .then(([p, d, w, h]) => {
        setProxy(p.data ?? p);
        const devList = Array.isArray(d) ? d : d.data ?? [];
        setDevices(devList);
        setWorkers(Array.isArray(w) ? w : w.workers ?? []);
        setHealth(h?.status === "ok");
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setFetchError(message);
        console.error("[NetworkContent] fetch failed:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <XCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">데이터를 불러오지 못했습니다</p>
        <p className="text-xs text-muted-foreground">{fetchError}</p>
      </div>
    );
  }

  const proxyPie = [
    { name: "활성", value: proxy?.active ?? 0, color: PIE_COLORS.active },
    { name: "무효", value: proxy?.invalid ?? 0, color: PIE_COLORS.invalid },
    { name: "미할당", value: proxy?.unassigned ?? 0, color: PIE_COLORS.unassigned },
  ].filter((d) => d.value > 0);

  const devicesByStatus = [
    { name: "온라인", count: devices.filter((d) => d.status === "online").length, fill: "#22c55e" },
    { name: "작업중", count: devices.filter((d) => d.status === "busy").length, fill: "#3b82f6" },
    { name: "오프라인", count: devices.filter((d) => d.status === "offline").length, fill: "#475569" },
    { name: "에러", count: devices.filter((d) => d.status === "error").length, fill: "#ef4444" },
  ];

  const pcBars = workers.map((w) => ({
    name: w.pc_number ?? w.hostname ?? "?",
    online: w.online_count ?? 0,
    total: w.device_count ?? 0,
    status: w.status,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatBox icon={Shield} label="프록시 전체" value={proxy?.total ?? 0} color="blue" />
        <StatBox icon={CheckCircle2} label="활성" value={proxy?.active ?? 0} color="green" />
        <StatBox icon={XCircle} label="무효" value={proxy?.invalid ?? 0} color="red" />
        <StatBox icon={Smartphone} label="디바이스" value={devices.length} color="blue" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                프록시 상태 분포
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={proxyPie}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {proxyPie.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, n: string) => [`${v}개`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {proxyPie.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded"
                      style={{ background: d.color }}
                    />
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                    <span className="font-mono text-sm font-bold">{d.value}</span>
                  </div>
                ))}
                {proxyPie.length === 0 && (
                  <p className="text-xs text-muted-foreground">프록시 없음</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                디바이스 상태 분포
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={devicesByStatus} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={55} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {devicesByStatus.map((_, i) => (
                    <Cell key={i} fill={devicesByStatus[i].fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                PC별 연결 상태
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(120, pcBars.length * 40)}>
              <BarChart data={pcBars} layout="vertical" margin={{ left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={45} />
                <Tooltip
                  formatter={(v: number, n: string) => [`${v}대`, n === "online" ? "온라인" : "전체"]}
                />
                <Bar dataKey="total" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="online" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                시스템 연결
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ConnRow label="Supabase DB" ok={health} />
            <ConnRow label="Supabase Realtime" ok={health} />
            <ConnRow
              label="Xiaowei WebSocket"
              ok={workers.some((w) => w.status === "online")}
              detail={`${workers.filter((w) => w.status === "online").length}/${workers.length} PC`}
            />
            <ConnRow
              label="프록시 풀"
              ok={(proxy?.active ?? 0) > 0}
              detail={`${proxy?.active ?? 0}/${proxy?.total ?? 0} 활성`}
            />
            <ConnRow
              label="디바이스"
              ok={devices.some((d) => d.status === "online")}
              detail={`${devices.filter((d) => d.status === "online").length}/${devices.length} 온라인`}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
