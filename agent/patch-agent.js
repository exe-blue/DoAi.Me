const fs = require("fs");
const path = "C:/Users/choi/doai-agent/agent.js";
let c = fs.readFileSync(path, "utf8");

// Check step 1 & 2
console.log("require:", c.includes('require("./command-poller")') ? "OK" : "MISSING");
console.log("let var:", c.includes("let commandPoller = null;") ? "OK" : "MISSING");

// Step 3: Find "Video dispatcher started" line and add after it
const marker3 = 'console.log("[Agent]';
const lines = c.split("\n");
let inserted3 = false;
let inserted4 = false;
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  newLines.push(lines[i]);
  
  // Step 3: after Video dispatcher started
  if (!inserted3 && lines[i].includes("Video dispatcher started")) {
    newLines.push("");
    newLines.push("  // 15a. Start command poller (web dashboard command queue)");
    newLines.push("  commandPoller = new CommandPoller(xiaowei, supabaseSync.supabase, {");
    newLines.push("    pcId: config.pcNumber,");
    newLines.push("    commandPollIntervalSec: 5,");
    newLines.push("  });");
    newLines.push("  commandPoller.start();");
    newLines.push('  console.log("[Agent] \\u2713 Command poller started (preset_commands)");');
    inserted3 = true;
  }
  
  // Step 4: after videoDispatcher.stop() block in shutdown
  if (!inserted4 && lines[i].includes("videoDispatcher.stop()")) {
    // skip the closing brace
    newLines.push(lines[++i]); // the "  }" line
    newLines.push("");
    newLines.push("  // Stop command poller");
    newLines.push("  if (commandPoller) {");
    newLines.push("    commandPoller.stop();");
    newLines.push("  }");
    inserted4 = true;
  }
}

fs.writeFileSync(path, newLines.join("\n"), "utf8");
console.log("Step 3 (init):", inserted3 ? "OK" : "FAILED");
console.log("Step 4 (shutdown):", inserted4 ? "OK" : "FAILED");
console.log("Done!");
