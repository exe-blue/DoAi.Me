/**
 * yt-player.js — YouTube 재생 모듈
 *
 * 검색 → 영상 선택 → 광고 건너뛰기 → 시청 → 홈
 * Xiaowei adbShell 기반, Galaxy S9 1080×1920 최적화.
 */

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function _extractShellOutput(res) {
  if (res == null) return '';
  if (typeof res === 'string') return res;
  if (res.data != null && typeof res.data === 'object' && !Array.isArray(res.data)) {
    const v = Object.values(res.data);
    if (v.length > 0 && typeof v[0] === 'string') return v[0];
  }
  if (res.data != null) return Array.isArray(res.data) ? String(res.data[0] ?? '') : String(res.data);
  if (res.msg != null) return String(res.msg);
  if (res.stdout != null) return String(res.stdout);
  return String(res);
}

class YTPlayer {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   */
  constructor(xiaowei) {
    this.xiaowei = xiaowei;
  }

  /** ADB shell 명령 실행 */
  async adb(serial, command) {
    return this.xiaowei.adbShell(serial, command);
  }

  /** 화면 크기 → {w, h, landscape} */
  async getScreen(serial) {
    try {
      const res = await this.adb(serial, 'wm size');
      const m = _extractShellOutput(res).match(/(\d+)x(\d+)/);
      if (m) { const w = parseInt(m[1]), h = parseInt(m[2]); return { w, h, landscape: w > h }; }
    } catch {}
    return { w: 1080, h: 1920, landscape: false };
  }

  /** UI dump → XML 문자열 */
  async dumpUI(serial) {
    try {
      await this.adb(serial, 'uiautomator dump /sdcard/ui.xml');
      await _sleep(800);
      const res = await this.adb(serial, 'cat /sdcard/ui.xml');
      return _extractShellOutput(res);
    } catch { return ''; }
  }

  /** XML에서 패턴 포함 노드의 bounds 중심 좌표 찾기 */
  findBoundsInXml(xml, pattern) {
    if (!xml) return null;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nodeRe = new RegExp('<node[^>]*' + escaped + '[^>]*>', 'i');
    const nodeMatch = xml.match(nodeRe);
    if (nodeMatch) {
      const bm = nodeMatch[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (bm) {
        return {
          x: Math.round((parseInt(bm[1]) + parseInt(bm[3])) / 2),
          y: Math.round((parseInt(bm[2]) + parseInt(bm[4])) / 2),
        };
      }
    }
    return null;
  }

  /** resource-id 또는 content-desc로 요소 찾아서 탭 */
  async findAndTap(serial, selector, retries = 1) {
    for (let i = 0; i <= retries; i++) {
      const xml = await this.dumpUI(serial);
      if (!xml) { if (i < retries) { await _sleep(1000); continue; } return false; }

      let pos = null;
      if (selector.resourceId) pos = this.findBoundsInXml(xml, `resource-id="${selector.resourceId}"`);
      if (!pos && selector.contentDesc) pos = this.findBoundsInXml(xml, `content-desc="${selector.contentDesc}"`);
      if (!pos && selector.textContains) pos = this.findBoundsInXml(xml, `text="[^"]*${selector.textContains}[^"]*"`);

      if (pos) {
        await this.adb(serial, `input tap ${pos.x} ${pos.y}`);
        return true;
      }
      if (i < retries) await _sleep(1000);
    }
    return false;
  }

  /** UI dump에서 요소 존재 여부만 확인 */
  async hasElement(serial, selector) {
    const xml = await this.dumpUI(serial);
    if (!xml) return false;
    if (selector.resourceId) return xml.includes(selector.resourceId);
    if (selector.contentDesc) return xml.includes(selector.contentDesc);
    if (selector.textContains) return xml.includes(selector.textContains);
    return false;
  }

  // ═══════════════════════════════════════════════════════
  // 광고 건너뛰기
  // ═══════════════════════════════════════════════════════

  /**
   * 광고 건너뛰기 시도. XML 우선 → 고정 좌표 폴백.
   * @returns {Promise<boolean>} 건너뛰기 시도 여부
   */
  async trySkipAd(serial) {
    const xml = await this.dumpUI(serial);
    if (xml) {
      const skipKeywords = ['skip_ad_button', 'skip_ad', '건너뛰기', '광고 건너뛰기', 'Skip ad'];
      for (const kw of skipKeywords) {
        if (!xml.includes(kw)) continue;
        const pos = this.findBoundsInXml(xml, kw);
        if (pos) {
          console.log(`[YTPlayer] 광고 "${kw}" → 탭 (${pos.x}, ${pos.y})`);
          await this.adb(serial, `input tap ${pos.x} ${pos.y}`);
          return true;
        }
      }
      const adSignals = ['ad_badge', 'ad_progress_text', 'ad_info_button', 'ad_cta_button', '광고', '스폰서', 'Sponsored'];
      for (const sig of adSignals) {
        if (xml.includes(sig)) {
          console.log(`[YTPlayer] 광고 신호 "${sig}" → 고정 좌표 탭`);
          return await this.skipAdFixed(serial);
        }
      }
    }
    return false;
  }

  /** 고정 좌표 건너뛰기: x85% y20% (실측 기준), 2회 탭 */
  async skipAdFixed(serial) {
    const scr = await this.getScreen(serial);
    const sx = Math.round(scr.w * 0.85);
    const sy = Math.round(scr.h * 0.20);
    console.log(`[YTPlayer] 광고 고정 탭 (${sx}, ${sy})`);
    await this.adb(serial, `input tap ${sx} ${sy}`);
    await _sleep(800);
    await this.adb(serial, `input tap ${sx} ${sy}`);
    return true;
  }

  /**
   * 프리롤 광고 전체 처리 (최대 2개 연속, 5회 시도)
   */
  async handlePrerollAds(serial) {
    console.log('[YTPlayer] 광고 처리: 6초 대기...');
    await _sleep(6000);

    let adsSkipped = 0;
    for (let i = 0; i < 5; i++) {
      const skipped = await this.trySkipAd(serial);
      if (skipped) {
        adsSkipped++;
        console.log(`[YTPlayer] 광고 #${adsSkipped} 건너뛰기 (${i + 1}회)`);
        await _sleep(3000);
        continue;
      }

      // XML에 없어도 고정 좌표 시도
      console.log(`[YTPlayer] 고정 좌표 시도 (${i + 1}회)`);
      await this.skipAdFixed(serial);
      await _sleep(2000);

      // 광고 끝났는지 확인
      const xml = await this.dumpUI(serial);
      const hasTitle = xml && xml.includes('video_title');
      const hasAd = xml && (xml.includes('ad_badge') || xml.includes('skip_ad') ||
        xml.includes('ad_progress') || xml.includes('스폰서') || xml.includes('Sponsored'));

      if (hasTitle && !hasAd) { console.log(`[YTPlayer] 광고 끝 (${adsSkipped}개)`); break; }
      if (hasAd) { adsSkipped++; console.log(`[YTPlayer] 광고 #${adsSkipped} 감지 — 6초 대기`); await _sleep(6000); continue; }

      try {
        const res = await this.adb(serial, 'dumpsys media_session | grep "state="');
        if (_extractShellOutput(res).includes('state=3')) { console.log('[YTPlayer] 재생 확인'); break; }
      } catch {}

      if (i < 4) await _sleep(3000);
    }
    return adsSkipped;
  }

  // ═══════════════════════════════════════════════════════
  // 재생 제어
  // ═══════════════════════════════════════════════════════

  /** 화면 깨우기 + 세로 모드 강제 */
  async wakeAndPortrait(serial) {
    await this.adb(serial, 'input keyevent KEYCODE_WAKEUP');
    await _sleep(300);
    await this.adb(serial, 'settings put system accelerometer_rotation 0');
    await this.adb(serial, 'settings put system user_rotation 0');
    await this.adb(serial, 'content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0');
    await this.adb(serial, 'content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:0');
  }

  /** YouTube 검색 결과 URL로 열기 (한글 입력 우회) */
  async openSearchResults(serial, searchKeyword) {
    await this.adb(serial, 'am force-stop com.google.android.youtube');
    await _sleep(1000);
    const encoded = encodeURIComponent(searchKeyword);
    await this.adb(serial, `am start -a android.intent.action.VIEW -d 'https://www.youtube.com/results?search_query=${encoded}'`);
    console.log(`[YTPlayer] 검색: "${searchKeyword}"`);
    await _sleep(5000);
  }

  /** 검색 결과에서 영상 선택 (광고 결과 감지 → 스크롤 or 바로 탭) */
  async selectVideoFromResults(serial) {
    const scr = await this.getScreen(serial);
    const midX = Math.round(scr.w / 2);
    const xml = await this.dumpUI(serial);
    const hasAd = xml && (xml.includes('광고') || xml.includes('Ad ·') || xml.includes('Sponsored'));

    if (hasAd) {
      console.log('[YTPlayer] 검색 결과 광고 감지 → 스크롤');
      await this.adb(serial, `input swipe ${midX} ${Math.round(scr.h * 0.75)} ${midX} ${Math.round(scr.h * 0.25)} 400`);
      await _sleep(2000);
    }

    const tapY = Math.round(scr.h * 0.35);
    console.log(`[YTPlayer] 영상 선택: (${midX}, ${tapY})`);
    await this.adb(serial, `input tap ${midX} ${tapY}`);
    await _sleep(5000);
  }

  /** 재생 상태 확인 + 재생 시도 */
  async ensurePlaying(serial) {
    const scr = await this.getScreen(serial);
    const px = Math.round(scr.w / 2);
    const py = scr.landscape ? Math.round(scr.h / 2) : Math.round(scr.h * 0.18);

    await this.adb(serial, `input tap ${px} ${py}`);
    await _sleep(800);
    await this.adb(serial, `input tap ${px} ${py}`);
    await _sleep(1000);
    await this.adb(serial, 'input keyevent KEYCODE_MEDIA_PLAY');
    await _sleep(1000);

    try {
      const res = await this.adb(serial, 'dumpsys media_session | grep "state="');
      return _extractShellOutput(res).includes('state=3');
    } catch { return false; }
  }

  /**
   * 전체 재생 플로우: 검색 → 선택 → 광고 건너뛰기 → 재생 확인
   * @returns {Promise<{playing: boolean, adsSkipped: number, screen: object}>}
   */
  async startVideo(serial, searchKeyword) {
    await this.wakeAndPortrait(serial);
    await this.openSearchResults(serial, searchKeyword);
    await this.selectVideoFromResults(serial);
    const adsSkipped = await this.handlePrerollAds(serial);
    const playing = await this.ensurePlaying(serial);
    const screen = await this.getScreen(serial);
    return { playing, adsSkipped, screen };
  }

  /** 홈으로 이동 */
  async goHome(serial) {
    await this.adb(serial, 'input keyevent KEYCODE_HOME');
  }
}

module.exports = YTPlayer;
