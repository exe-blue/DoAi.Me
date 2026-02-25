/**
 * Entry script for YouTube Commander when invoked via Xiaowei autojsCreate.
 * Reads command/commands from engines.myEngine().execArgv and calls YouTubeCommander.
 * Deploy alongside youtube_commander.js (e.g. /sdcard/scripts/).
 */
var argv = (typeof engines !== 'undefined' && engines.myEngine && engines.myEngine().execArgv)
  ? engines.myEngine().execArgv
  : {};

var YouTubeCommander = require('./youtube_commander.js');

var result;
if (argv.commands && Array.isArray(argv.commands)) {
  result = YouTubeCommander.pipeline(argv.commands, argv.stepDelay || 500);
} else if (argv.command && typeof argv.command === 'object') {
  result = YouTubeCommander.execute(argv.command);
} else {
  result = { success: false, error: 'execArgv.command or execArgv.commands required' };
}

if (typeof console !== 'undefined' && console.log) {
  console.log('[YTCmdRun] ' + JSON.stringify(result));
}
result;
