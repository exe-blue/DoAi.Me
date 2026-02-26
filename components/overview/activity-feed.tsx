"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SystemEvent {
  event_type: string;
  message: string;
  details: any;
  timestamp: string;
}

interface ActivityFeedProps {
  events: SystemEvent[];
}

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'task_started':
      return '>';
    case 'task_completed':
      return '✓';
    case 'task_failed':
      return 'x';
    case 'device_offline':
      return '⚠';
    case 'device_recovered':
      return '↑';
    case 'proxy_invalid':
      return '⚠';
    case 'agent_started':
      return '•';
    default:
      return '•';
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'task_completed':
    case 'device_recovered':
      return 'text-emerald-600';
    case 'task_failed':
    case 'device_offline':
    case 'proxy_invalid':
      return 'text-red-600';
    case 'task_started':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const displayEvents = events.slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">활동 로그</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {displayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              아직 활동 내역이 없습니다.
            </p>
          ) : (
            displayEvents.map((event, idx) => (
              <div
                key={`${event.timestamp}-${idx}`}
                className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors animate-in fade-in duration-200"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <span className={`font-mono text-sm font-bold ${getEventColor(event.event_type)}`}>
                  {getEventIcon(event.event_type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{event.message}</p>
                  {event.details && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {typeof event.details === 'string'
                        ? event.details
                        : JSON.stringify(event.details)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
