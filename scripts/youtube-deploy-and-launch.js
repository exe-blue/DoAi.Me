/**
 * 사용방법대로: 배포 후 YouTube 실행
 *
 * 1. 터미널 1: Next.js 서버 실행
 *    npx next dev
 *
 * 2. .env.local 에 API_KEY 설정 (Next.js 서버와 동일)
 *
 * 3. 터미널 2 (프로젝트 루트에서)
 *    node scripts/youtube-deploy-and-launch.js [BASE_URL]
 *    node scripts/youtube-deploy-and-launch.js --test [BASE_URL]   # 배포 후 get_state 로 검증
 *
 * 옵션: 이 스크립트 실행 시에만 PC_ID=uuid 로 특정 PC 대상 (전역 .env 에 넣지 말 것 — pc_id는 DB/에이전트에서 결정)
 *
 * 배포→실행 테스트 순서 (수동): docs/youtube-deploy-flow.md 참고
 * - POST /api/youtube/deploy { deploy_all, devices, pc_id }
 * - adb shell ls /sdcard/scripts/
 * - POST /api/youtube/command { command: { action: "get_state" }, pc_id }
 */

const fs = require("fs");
const path = require("path");

// .env.local 이 있으면 API_KEY 등 로드 (Next.js와 동일한 값 사용)
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  });
}

const args = process.argv.slice(2);
const testMode = args.includes("--test");
const base = args.filter((a) => a !== "--test")[0] || "http://localhost:3000";
const pcId = process.env.PC_ID || null;
const apiKey = process.env.API_KEY;

function headers() {
  const h = { "Content-Type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

function deployBody() {
  const b = { deploy_all: true, devices: "all" };
  if (pcId) b.pc_id = pcId;
  return b;
}

function commandBody(action, params = {}) {
  const b = { command: { action, params }, devices: "all" };
  if (pcId) b.pc_id = pcId;
  return b;
}

async function run() {
  console.log("[1/2] POST /api/youtube/deploy", JSON.stringify(deployBody()));
  const deployRes = await fetch(`${base}/api/youtube/deploy`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(deployBody()),
  });
  const deployJson = await deployRes.json();
  if (!deployRes.ok) {
    console.error("Deploy failed:", deployJson);
    if (deployRes.status === 401 || (deployJson.error && deployJson.error.includes("Authentication"))) {
      console.error("\n→ API 인증 필요. .env.local 에 API_KEY 를 추가하세요 (Next.js 서버와 동일).");
      console.error("  이 스크립트는 프로젝트 루트의 .env.local 을 자동으로 읽습니다.");
      console.error("  또는: API_KEY=your_key node scripts/youtube-deploy-and-launch.js");
    } else if (deployJson.error && deployJson.error.includes("SUPABASE")) {
      console.error("\n→ Next.js 서버에 Supabase 환경 변수가 없습니다.");
      console.error("  .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후 npx next dev 재실행.");
    }
    process.exit(1);
  }
  console.log("Deploy OK:", deployJson.success ? `tasks: ${(deployJson.tasks || []).length}` : deployJson);

  const action = testMode ? "get_state" : "launch";
  const params = testMode ? {} : { fromScratch: true };
  console.log("\n[2/2] POST /api/youtube/command", JSON.stringify(commandBody(action, params)));
  const cmdRes = await fetch(`${base}/api/youtube/command`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(commandBody(action, params)),
  });
  const cmdJson = await cmdRes.json();
  if (!cmdRes.ok) {
    console.error("Command failed:", cmdJson);
    process.exit(1);
  }
  console.log("Command OK:", cmdJson.task_id ? `task_id=${cmdJson.task_id}` : cmdJson);
  if (testMode) console.log("\n배포 검증용 get_state 요청 완료. Agent 로그 및 adb shell ls /sdcard/scripts/ 로 확인.");
  else console.log("\nDone. Agent가 tasks를 가져가서 배포 후 실행합니다.");
}

run().catch((err) => {
  if (err.message === "fetch failed" || err.cause?.code === "ECONNREFUSED") {
    console.error("연결 실패. Next.js 서버가 떠 있는지 확인하세요: npx next dev");
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
