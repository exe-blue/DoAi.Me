/**
 * agent/device — 디바이스 관리 모듈
 */
const { pcModels, deviceModels } = require('./models');

/** 두 모델 모두 초기화 */
function init(supabase) {
  pcModels.init(supabase);
  deviceModels.init(supabase);
}

module.exports = { init, pcModels, deviceModels };
