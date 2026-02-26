"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AlertCircle, AlertTriangle, Info, Flame } from "lucide-react";

interface SystemAlertsProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface SystemEvent {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  worker_id?: string;
  created_at: string;
}

const SEVERITY_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  info: {
    icon: Info,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  warn: {
    icon: AlertTriangle,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  fatal: {
    icon: Flame,
    color: "text-red-300",
    bg: "bg-red-600/15",
    border: "border-red-400/30",
  },
};

const DEFAULT_SEVERITY = SEVERITY_CONFIG.info;

function getRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0) return "방금";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function EventRow({
  event,
  isNew,
}: {
  event: SystemEvent;
  isNew: boolean;
}) {
  const config = SEVERITY_CONFIG[event.severity] ?? DEFAULT_SEVERITY;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-500 ${
        config.bg
      } ${config.border} ${isNew ? "animate-fade-in" : ""}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${config.bg} ${config.color}`}
          >
            {event.event_type}
          </span>
          {event.worker_id && (
            <span className="text-[10px] text-gray-500">
              {event.worker_id}
            </span>
          )}
        </div>
        <p className="text-sm leading-snug text-gray-300">{event.message}</p>
        <p className="mt-1 text-[10px] text-gray-500">
          {getRelativeTime(event.created_at)}
        </p>
      </div>
    </div>
  );
}

export function SystemAlerts({
  supabaseUrl,
  supabaseAnonKey,
}: SystemAlertsProps) {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    supabaseRef.current = client;

    const channel = client.channel("room:system");
    channel.on(
      "broadcast",
      { event: "insert" },
      (msg: {
        payload: {
          type: string;
          record: {
            event_type: string;
            severity: string;
            message: string;
            worker_id?: string;
            created_at: string;
          };
        };
      }) => {
        const record = msg.payload.record;
        const id = `evt-${Date.now()}-${counterRef.current++}`;
        const newEvent: SystemEvent = { id, ...record };

        setEvents((prev) => [newEvent, ...prev].slice(0, 10));
        setNewIds((prev) => new Set(prev).add(id));

        // Remove "new" animation flag after 1s
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 1000);
      }
    );
    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseAnonKey]);

  return (
    <div className="rounded-xl border border-[#1e2028] bg-[#111318] p-5">
      <h3 className="mb-4 text-base font-semibold text-white">시스템 알림</h3>

      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-gray-500">
              실시간 이벤트를 대기 중...
            </p>
          </div>
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              isNew={newIds.has(event.id)}
            />
          ))
        )}
      </div>

      {/* fade-in animation keyframes */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :global(.animate-fade-in) {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
