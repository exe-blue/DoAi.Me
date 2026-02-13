"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function LogsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">로그</h1>
        <p className="text-base text-muted-foreground">
          시스템 실행 로그를 확인합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
            <CardTitle>실행 로그</CardTitle>
          </div>
          <CardDescription>Coming in STEP 8</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            작업 로그, 에러 로그, 시스템 이벤트 조회 기능이 곧 추가됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
