/**
 * agent/video-manager — 영상 풀 + 미션 관리 모듈
 */
const { videoModels, channelModels } = require('./models');
const { VideoManagerService } = require('./service');

function init(supabase) {
  videoModels.init(supabase);
  channelModels.init(supabase);
}

module.exports = { init, videoModels, channelModels, VideoManagerService };
