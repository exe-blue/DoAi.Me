"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

const GIF_TINT = "gif-tint-lime";

export default function Widget() {
  const [now, setNow] = useState(new Date());
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const day = now.toLocaleDateString("ko-KR", { weekday: "long" });
  const date = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="w-full aspect-[2] relative overflow-hidden bg-card border-border min-h-[140px]">
      {!imgError && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image
            src="/assets/pc_blueprint.gif"
            alt=""
            fill
            className={`object-contain opacity-30 ${GIF_TINT}`}
            unoptimized
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <CardContent className="relative z-10 flex flex-col justify-between h-full p-4 text-sm font-medium uppercase bg-accent/20">
        <div className="flex justify-between items-center">
          <span className="opacity-50">{day}</span>
          <span>{date}</span>
        </div>

        <div className="text-center">
          <div
            className="text-4xl md:text-5xl font-black tracking-tighter"
            suppressHydrationWarning
          >
            {time}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="opacity-50">현재 시각</span>
        </div>
      </CardContent>
    </Card>
  );
}
