const XC = require("./xiaowei-client");
const x = new XC("ws://127.0.0.1:22222/");
x.on("connected", async () => {
  const s = "423349535a583098";

  let r = await x.adbShell(s, "wm size");
  console.log("1. Current size:", r.data ? r.data[s] : r);

  await x.adbShell(s, "wm size reset");
  await new Promise((r) => setTimeout(r, 500));
  r = await x.adbShell(s, "wm size");
  console.log("2. After reset:", r.data ? r.data[s] : r);

  r = await x.adbShell(s, "settings get system accelerometer_rotation");
  console.log("3. Auto-rotate:", r.data ? r.data[s] : r);
  r = await x.adbShell(s, "settings get system user_rotation");
  console.log("4. User rotation:", r.data ? r.data[s] : r);

  setTimeout(() => process.exit(0), 2000);
});
x.connect();
