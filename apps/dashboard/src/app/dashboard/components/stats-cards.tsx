"use client";

import { useEffect, useRef, useState } from "react";
import { Server, Smartphone, Loader, CheckCircle } from "lucide-react";

interface StatsCardsProps {
  stats: {
    workers_online: number | null;
    workers_total: number | null;
    devices_online: number | null;
    devices_total: number | null;
    devices_busy: number | null;
    tasks_running: number | null;
    tasks_pending: number | null;
    tasks_completed_24h: number | null;
  } | null;
}

function useAnimatedNumber(target: number | null, duration = 1000): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || target === prevTarget.current) return;
    prevTarget.current = target;

    const start = performance.now();
    const from = 0;
    const to = target;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

interface CardConfig {
  icon: React.ElementType;
  label: string;
  getValue: (s: NonNullable<StatsCardsProps["stats"]>) => number | null;
  getSubtitle: (s: NonNullable<StatsCardsProps["stats"]>) => string;
  gradient: string;
}

const cards: CardConfig[] = [
  {
    icon: Server,
    label: "워커 온라인",
    getValue: (s) => s.workers_online,
    getSubtitle: (s) => `/ ${s.workers_total ?? 0} 총 워커`,
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    icon: Smartphone,
    label: "디바이스 온라인",
    getValue: (s) => s.devices_online,
    getSubtitle: (s) => `/ ${s.devices_total ?? 0} 전체`,
    gradient: "from-green-500/20 to-emerald-500/20",
  },
  {
    icon: Loader,
    label: "태스크 실행중",
    getValue: (s) => s.tasks_running,
    getSubtitle: (s) => `+ ${s.tasks_pending ?? 0} 대기`,
    gradient: "from-yellow-500/20 to-orange-500/20",
  },
  {
    icon: CheckCircle,
    label: "24시간 완료",
    getValue: (s) => s.tasks_completed_24h,
    getSubtitle: () => "최근 24시간",
    gradient: "from-purple-500/20 to-pink-500/20",
  },
];

function StatCard({
  config,
  stats,
}: {
  config: CardConfig;
  stats: NonNullable<StatsCardsProps["stats"]>;
}) {
  const rawValue = config.getValue(stats);
  const animatedValue = useAnimatedNumber(rawValue);
  const Icon = config.icon;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#1e2028] bg-[#111318] p-5 transition-all duration-300 hover:border-[#2a2d38]">
      {/* Gradient glow on hover */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-400">
            {config.label}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-white">
            {rawValue !== null ? animatedValue : "—"}
          </span>
          <span className="text-sm text-gray-500">
            {config.getSubtitle(stats)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function StatsCards({ stats }: StatsCardsProps) {
  const fallback: NonNullable<StatsCardsProps["stats"]> = stats ?? {
    workers_online: null,
    workers_total: null,
    devices_online: null,
    devices_total: null,
    devices_busy: null,
    tasks_running: null,
    tasks_pending: null,
    tasks_completed_24h: null,
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((config) => (
        <StatCard key={config.label} config={config} stats={fallback} />
      ))}
    </div>
  );
}
