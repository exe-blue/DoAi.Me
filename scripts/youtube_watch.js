// Xiaowei AutoJS - YouTube 시청 스크립트
// Agent가 adbShell로 YouTube 앱을 먼저 실행한 후 이 스크립트를 autojsCreate로 호출
// 파라미터는 Xiaowei autojsCreate의 data/execArgv로 전달됨 (videoUrl, watchDuration)

var videoUrl = engines.myEngine().execArgv.videoUrl || "";
var watchDuration = engines.myEngine().execArgv.watchDuration || 30000;

if (videoUrl) {
  // YouTube 앱에서 해당 영상 열기
  shell("am start -a android.intent.action.VIEW -d '" + videoUrl + "'");
}

// 시청 시간 대기
sleep(watchDuration);
