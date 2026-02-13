"use client";

import { useEffect } from "react";
import { useWorkersStore } from "@/hooks/use-workers-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function WorkersPage() {
  const { nodes, fetch: fetchWorkers } = useWorkersStore();

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">워커</h1>
        <p className="text-base text-muted-foreground">
          연결된 워커 노드를 관리합니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <Card key={node.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {node.name}
              </CardTitle>
              {node.status === "connected" ? (
                <Wifi className="h-4 w-4 text-status-success" />
              ) : (
                <WifiOff className="h-4 w-4 text-status-error" />
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {node.ip}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {node.devices.length}대 연결
                  </Badge>
                  <Badge
                    variant={
                      node.status === "connected" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {node.status === "connected" ? "온라인" : "오프라인"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {nodes.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              연결된 워커가 없습니다.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
