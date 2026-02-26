/**
 * agent/adb — ADB + XML UI 자동화 코어 모듈
 */
const { ADBDevice, extractOutput } = require('./client');
const { parseUI, UITree, UINode } = require('./xml-parser');
const { dumpUI, waitForNode, getForegroundApp, getPlaybackState, isScreenOn } = require('./screen');
const { sleep, randInt, humanDelay, jitterCoord, pctToAbs, moduleTransitionDelay, missionStartDelay, randomSwipeDuration } = require('./helpers');

module.exports = {
  ADBDevice,
  extractOutput,
  parseUI,
  UITree,
  UINode,
  dumpUI,
  waitForNode,
  getForegroundApp,
  getPlaybackState,
  isScreenOn,
  sleep,
  randInt,
  humanDelay,
  jitterCoord,
  pctToAbs,
  moduleTransitionDelay,
  missionStartDelay,
  randomSwipeDuration,
};
