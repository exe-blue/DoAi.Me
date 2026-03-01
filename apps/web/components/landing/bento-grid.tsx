"use client";

import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";
import { Server, Smartphone, Shield, Zap } from "lucide-react";

const ACCENT = "#AFFF00";

const features = [
  {
    icon: Server,
    title: "PC",
    subtitle: "관제 노드",
    description: "Agent가 설치된 PC 단위 관리",
    accent: ACCENT,
  },
  {
    icon: Smartphone,
    title: "디바이스",
    subtitle: "스마트폰",
    description: "USB/OTG 연결 디바이스 실시간 상태",
    accent: "#00D4FF",
  },
  {
    icon: Shield,
    title: "프록시",
    subtitle: "할당·검증",
    description: "디바이스별 프록시 1:1 매핑",
    accent: "#FF6B35",
  },
  {
    icon: Zap,
    title: "500대",
    subtitle: "규모",
    description: "물리 디바이스 관제 시스템",
    accent: ACCENT,
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xS = useSpring(x, { stiffness: 300, damping: 30 });
  const yS = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(yS, [-0.5, 0.5], ["8deg", "-8deg"]);
  const rotateY = useTransform(xS, [-0.5, 0.5], ["-8deg", "8deg"]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
        setHovered(false);
      }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className="relative group cursor-pointer"
    >
      <motion.div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${feature.accent}40, transparent, ${feature.accent}40)`,
          filter: "blur(8px)",
        }}
      />
      <div className="relative bg-[#181818] rounded-2xl p-5 border border-white/8 overflow-hidden h-full">
        <div className="relative z-10 flex flex-col h-full min-h-[140px]">
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
            style={{ backgroundColor: `${feature.accent}18` }}
            whileHover={{ scale: 1.1 }}
          >
            <feature.icon
              className="w-5 h-5"
              style={{ color: feature.accent }}
            />
          </motion.div>

          <div className="flex-1">
            <div
              className="text-3xl font-black tracking-tight"
              style={{ color: feature.accent }}
            >
              {feature.title}
            </div>
            <h3 className="text-sm font-semibold text-white mt-1">
              {feature.subtitle}
            </h3>
            <p className="text-xs text-white/40 mt-1 font-mono">
              {feature.description}
            </p>
          </div>

          <motion.div
            className="h-[2px] rounded-full mt-4"
            style={{ backgroundColor: feature.accent }}
            initial={{ scaleX: 0, originX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 + index * 0.1 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

export function BentoGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section
      id="features"
      className="relative py-20 bg-[#0a0a0a] overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#080808] to-[#0a0a0a]" />
      <div ref={ref} className="max-w-5xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          className="text-center mb-12"
        >
          <motion.span
            className="inline-block font-mono text-xs tracking-[0.3em] uppercase"
            style={{ color: ACCENT }}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1 }}
          >
            기능
          </motion.span>
          <motion.h2
            className="text-3xl md:text-4xl font-black text-white tracking-tight mt-2"
            initial={{ y: 60 }}
            animate={inView ? { y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            DoAi.Me 콘솔
          </motion.h2>
          <motion.div
            className="h-[2px] w-12 mx-auto mt-3 rounded-full"
            style={{ backgroundColor: ACCENT }}
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
          />
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
