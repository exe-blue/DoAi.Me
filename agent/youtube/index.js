/**
 * agent/youtube — YouTube 자동화 모듈
 */
const { RES, COORDS, AD_SIGNALS, AD_SKIP_KEYWORDS, YT_PACKAGE } = require('./selectors');
const { openSearchResults, selectFromResults, extractSearchResults, searchAndSelect } = require('./search');
const { trySkipAd, skipAdFixed, handlePrerollAds, ensurePlaying, simulateHumanBehavior, watchVideo } = require('./watch');
const { getVideoInfo, verifyVideoMatch } = require('./verify');

module.exports = {
  // selectors
  RES, COORDS, AD_SIGNALS, YT_PACKAGE,
  // search
  openSearchResults, selectFromResults, extractSearchResults, searchAndSelect,
  // watch
  trySkipAd, handlePrerollAds, ensurePlaying, simulateHumanBehavior, watchVideo,
  // verify
  getVideoInfo, verifyVideoMatch,
};
