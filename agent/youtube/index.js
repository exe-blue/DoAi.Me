/**
 * agent/youtube — YouTube 자동화 모듈
 */
const { RES, COORDS, AD_SIGNALS, AD_SKIP_KEYWORDS, YT_PACKAGE } = require('./selectors');
const { openSearchResults, selectFromResults, extractSearchResults, searchAndSelect } = require('./search');
const { trySkipAd, skipAdFixed, handlePrerollAds, ensurePlaying, simulateHumanBehavior, watchVideo } = require('./watch');
const { getVideoInfo, verifyVideoMatch, verifyPlaying, verifyTargetVideo, verifyWatchCompletion, detectBotWarning } = require('./verify');
const { likeVideo, subscribeChannel, writeComment, saveToPlaylist } = require('./action');

module.exports = {
  // selectors
  RES, COORDS, AD_SIGNALS, YT_PACKAGE,
  // search
  openSearchResults, selectFromResults, extractSearchResults, searchAndSelect,
  // watch
  trySkipAd, handlePrerollAds, ensurePlaying, simulateHumanBehavior, watchVideo,
  // verify
  getVideoInfo, verifyVideoMatch, verifyPlaying, verifyTargetVideo, verifyWatchCompletion, detectBotWarning,
  // actions
  likeVideo, subscribeChannel, writeComment, saveToPlaylist,
  // flows
  executeYouTubeMission: require('./flows').executeYouTubeMission,
  // preflight
  preflightCheck: require('./preflight').preflightCheck,
  quickSelectorCheck: require('./preflight').quickSelectorCheck,
};
