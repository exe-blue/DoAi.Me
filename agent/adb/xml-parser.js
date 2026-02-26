/**
 * agent/adb/xml-parser.js — uiautomator XML dump 파싱
 *
 * XML에서 노드 탐색, bounds 좌표 추출, 속성 읽기.
 * fast-xml-parser 미사용 — 정규식 기반 (의존성 최소화).
 *
 * 사용법:
 *   const { parseUI } = require('./adb');
 *   const ui = parseUI(xmlString);
 *   const btn = ui.findByResourceId('com.google.android.youtube:id/like_button');
 *   if (btn) await dev.tap(btn.cx, btn.cy);
 */

/**
 * XML 문자열을 파싱하여 UITree 객체 반환
 * @param {string} xml - uiautomator dump XML
 * @returns {UITree}
 */
function parseUI(xml) {
  return new UITree(xml || '');
}

class UITree {
  constructor(xml) {
    this.xml = xml;
    this._nodes = null; // lazy parsed
  }

  /** XML에 특정 텍스트가 포함되어 있는지 */
  contains(text) {
    return this.xml.includes(text);
  }

  /** XML이 비어있는지 */
  get isEmpty() {
    return !this.xml || this.xml.length < 50;
  }

  /**
   * resource-id로 노드 찾기
   * @param {string} resourceId - e.g. 'com.google.android.youtube:id/like_button'
   * @returns {UINode|null}
   */
  findByResourceId(resourceId) {
    return this._findNode(`resource-id="${resourceId}"`);
  }

  /**
   * content-desc로 노드 찾기 (정확 매치)
   * @param {string} desc
   * @returns {UINode|null}
   */
  findByContentDesc(desc) {
    return this._findNode(`content-desc="${desc}"`);
  }

  /**
   * content-desc에 텍스트 포함된 노드 찾기
   * @param {string} partial
   * @returns {UINode|null}
   */
  findByContentDescContains(partial) {
    const escaped = partial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`content-desc="[^"]*${escaped}[^"]*"`, 'i');
    const m = this.xml.match(re);
    if (!m) return null;
    return this._findNode(m[0]);
  }

  /**
   * text 속성으로 노드 찾기 (정확 매치)
   * @param {string} text
   * @returns {UINode|null}
   */
  findByText(text) {
    return this._findNode(`text="${text}"`);
  }

  /**
   * text 속성에 텍스트 포함된 노드 찾기
   * @param {string} partial
   * @returns {UINode|null}
   */
  findByTextContains(partial) {
    const escaped = partial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`text="[^"]*${escaped}[^"]*"`, 'i');
    const m = this.xml.match(re);
    if (!m) return null;
    return this._findNode(m[0]);
  }

  /**
   * 여러 셀렉터 순서대로 시도 (첫 번째 매치 반환)
   * @param {Array<{resourceId?, contentDesc?, text?, textContains?, contentDescContains?}>} selectors
   * @returns {UINode|null}
   */
  findFirst(selectors) {
    for (const sel of selectors) {
      let node = null;
      if (sel.resourceId) node = this.findByResourceId(sel.resourceId);
      if (!node && sel.contentDesc) node = this.findByContentDesc(sel.contentDesc);
      if (!node && sel.contentDescContains) node = this.findByContentDescContains(sel.contentDescContains);
      if (!node && sel.text) node = this.findByText(sel.text);
      if (!node && sel.textContains) node = this.findByTextContains(sel.textContains);
      if (node) return node;
    }
    return null;
  }

  /**
   * 긴 텍스트를 가진 TextView 후보 목록 (제목 추출용)
   * @param {number} [minLen=10]
   * @param {string[]} [excludeWords]
   * @returns {string[]}
   */
  findLongTexts(minLen = 10, excludeWords = []) {
    const re = /text="([^"]+)"/gi;
    const results = [];
    let m;
    while ((m = re.exec(this.xml)) !== null) {
      const t = m[1];
      if (t.length < minLen || t.length > 200) continue;
      if (excludeWords.some(w => t.includes(w))) continue;
      results.push(t);
    }
    return results.sort((a, b) => b.length - a.length);
  }

  /** @private 키워드가 포함된 노드에서 UINode 추출 */
  _findNode(keyword) {
    if (!this.xml || !this.xml.includes(keyword.split('=')[1]?.replace(/"/g, '') || keyword)) return null;

    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nodeRe = new RegExp('<node[^>]*' + escaped + '[^>]*/?>', 'i');
    const nodeMatch = this.xml.match(nodeRe);
    if (!nodeMatch) return null;

    return UINode.fromXml(nodeMatch[0]);
  }
}

class UINode {
  constructor(attrs) {
    this.resourceId = attrs.resourceId || '';
    this.contentDesc = attrs.contentDesc || '';
    this.text = attrs.text || '';
    this.className = attrs.className || '';
    this.selected = attrs.selected || false;
    this.bounds = attrs.bounds || null; // { x1, y1, x2, y2 }
  }

  /** 중심 X 좌표 */
  get cx() { return this.bounds ? Math.round((this.bounds.x1 + this.bounds.x2) / 2) : 0; }

  /** 중심 Y 좌표 */
  get cy() { return this.bounds ? Math.round((this.bounds.y1 + this.bounds.y2) / 2) : 0; }

  /** 너비 */
  get width() { return this.bounds ? this.bounds.x2 - this.bounds.x1 : 0; }

  /** 높이 */
  get height() { return this.bounds ? this.bounds.y2 - this.bounds.y1 : 0; }

  /** bounds가 유효한지 */
  get hasBounds() { return this.bounds !== null && this.cx > 0 && this.cy > 0; }

  /**
   * XML 노드 문자열에서 UINode 생성
   * @param {string} nodeXml - <node ... /> 문자열
   * @returns {UINode}
   */
  static fromXml(nodeXml) {
    const attr = (name) => {
      const re = new RegExp(`${name}="([^"]*)"`, 'i');
      const m = nodeXml.match(re);
      return m ? m[1] : '';
    };

    const boundsStr = attr('bounds');
    let bounds = null;
    if (boundsStr) {
      const bm = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (bm) {
        bounds = {
          x1: parseInt(bm[1], 10), y1: parseInt(bm[2], 10),
          x2: parseInt(bm[3], 10), y2: parseInt(bm[4], 10),
        };
      }
    }

    return new UINode({
      resourceId: attr('resource-id'),
      contentDesc: attr('content-desc'),
      text: attr('text'),
      className: attr('class'),
      selected: attr('selected') === 'true',
      bounds,
    });
  }
}

module.exports = { parseUI, UITree, UINode };
