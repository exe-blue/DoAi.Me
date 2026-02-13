"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tv } from "lucide-react";

export default function ChannelsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">채널</h1>
        <p className="text-base text-muted-foreground">
          YouTube 채널 및 컨텐츠를 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tv className="h-5 w-5 text-muted-foreground" />
            <CardTitle>채널 관리</CardTitle>
          </div>
          <CardDescription>Coming in STEP 11</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            채널 목록, 컨텐츠 스크래핑, 작업 등록 기능이 곧 추가됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
