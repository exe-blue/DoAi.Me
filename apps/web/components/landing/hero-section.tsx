"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";

const ACCENT = "#AFFF00";
const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] },
  }),
};

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const rawOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const opacity = useSpring(rawOpacity, springConfig);

  const benefits = ["디바이스 관제", "작업 대기열", "프록시 관리", "500대 규모"];

  return (
    <section
      id="hero"
      ref={ref}
      className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-[#0a0a0a] noise-overlay"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 60% 40%, rgba(175,255,0,0.03) 0%, transparent 70%)",
        }}
      />

      <motion.div
        className="absolute top-20 left-10 w-32 h-32 rounded-full blur-3xl bg-[#AFFF00]/10"
        animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-40 right-20 w-40 h-40 rounded-full blur-3xl bg-[#AFFF00]/06"
        animate={{ x: [0, -40, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-16">
        <motion.div style={{ opacity }} className="space-y-6 max-w-2xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
            className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white px-3 py-1.5 rounded-full text-xs font-mono tracking-wider backdrop-blur-sm"
          >
            <motion.span
              className="w-2 h-2 rounded-full bg-[#AFFF00]"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            스마트폰 팜 콘솔 — 다크 에디션
          </motion.div>

          <div className="overflow-hidden space-y-1">
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="text-6xl md:text-8xl font-black tracking-tighter text-white leading-[0.9]"
            >
              AI가 스스로
            </motion.h1>
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]"
              style={{ color: ACCENT }}
            >
              콘텐츠를 소비
            </motion.h1>
          </div>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="text-lg md:text-xl font-mono text-white/50 tracking-tight max-w-md"
          >
            500대 물리 디바이스 관제 시스템. 다크 모드 전용.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="flex flex-wrap gap-3"
          >
            <Link href="/login">
              <motion.span
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm tracking-wide relative overflow-hidden"
                style={{ backgroundColor: ACCENT, color: "#121212" }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <span className="relative z-10">로그인</span>
                <motion.svg
                  className="w-4 h-4 relative z-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  initial={{ x: 0 }}
                  whileHover={{ x: 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </motion.svg>
              </motion.span>
            </Link>
            <Link href="/login?signup=1">
              <motion.span
                className="inline-flex border border-white/20 text-white px-6 py-3 rounded-full font-bold text-sm tracking-wide hover:bg-white/5 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                회원가입
              </motion.span>
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={5}
            className="flex flex-wrap gap-5 pt-2"
          >
            {benefits.map((b, i) => (
              <motion.div
                key={b}
                className="flex items-center gap-2 text-xs font-mono text-white/40"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.1 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#AFFF00]" />
                {b}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-5 h-8 border border-white/20 rounded-full flex justify-center pt-1.5">
              <motion.div
                className="w-1 h-2 bg-white/30 rounded-full"
                animate={{ y: [0, 6, 0], opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
