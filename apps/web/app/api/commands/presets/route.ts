import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "Android 버전", command: "getprop ro.build.version.release", category: "info", description: "Android OS 버전 확인" },
  { label: "배터리 정보", command: "dumpsys battery", category: "info", description: "배터리 상태 및 잔량" },
  { label: "설치된 앱", command: "pm list packages -3", category: "info", description: "사용자 설치 앱 목록" },
  { label: "현재 프록시", command: "settings get global http_proxy", category: "network", description: "현재 설정된 프록시" },
  { label: "홈 버튼", command: "input keyevent 3", category: "control", description: "홈 화면으로 이동" },
  { label: "YouTube 종료", command: "am force-stop com.google.android.youtube", category: "app", description: "YouTube 앱 강제 종료" },
  { label: "화면 켜기", command: "input keyevent 26", category: "control", description: "전원 버튼 (화면 켜기/끄기)" },
  { label: "볼륨 음소거", command: "input keyevent 164", category: "control", description: "볼륨 음소거 토글" },
  { label: "IP 주소", command: "ip route | grep src", category: "network", description: "디바이스 IP 주소 확인" },
  { label: "디스크 사용량", command: "df -h /data", category: "info", description: "내부 저장소 사용량" },
  { label: "재부팅", command: "reboot", category: "danger", description: "디바이스 재부팅 (주의!)", dangerous: true },
];

export async function GET() {
  return NextResponse.json({ presets: PRESETS });
}
