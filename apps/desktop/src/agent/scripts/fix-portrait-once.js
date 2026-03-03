const XC = require("./xiaowei-client");
const x = new XC("ws://127.0.0.1:22222/");
x.on("connected", async () => {
  const res = await x.list();
  const devs = res.data || res || [];
  for (const d of devs) {
    const s = d.onlySerial || d.serial || d.serialNumber || d.id;
    if (!s || s.length < 6) continue;
    console.log("Fixing", s.substring(0, 6));
    await x.adbShell(s, "settings put system accelerometer_rotation 0");
    await x.adbShell(s, "settings put system user_rotation 0");
    await x.adbShell(s, "content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0");
    await x.adbShell(s, "am force-stop com.google.android.youtube");
    await new Promise((r) => setTimeout(r, 500));
    await x.adbShell(s, "wm size reset");
    await x.adbShell(s, "wm density reset");
    console.log("Done", s.substring(0, 6));
  }
  setTimeout(() => process.exit(0), 2000);
});
x.connect();
