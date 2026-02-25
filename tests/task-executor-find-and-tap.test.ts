import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TaskExecutor = require("../agent/task-executor");

describe("TaskExecutor._findAndTap", () => {
  it("matches content-desc exactly to avoid tapping playlist action", async () => {
    vi.useFakeTimers();
    try {
      const xmlDump = `
        <hierarchy>
          <node index="0" content-desc="재생목록에 저장" bounds="[900,100][1000,200]" />
          <node index="1" content-desc="재생" bounds="[100,200][200,300]" />
        </hierarchy>
      `.trim();

      const adbShell = vi.fn(async (_serial: string, command: string) => {
        if (command === "cat /sdcard/window_dump.xml") {
          return { data: xmlDump };
        }
        return { data: "" };
      });

      const executor = new TaskExecutor({ adbShell }, {}, {});

      const findAndTapPromise = executor._findAndTap("SERIAL-1", { contentDesc: "재생" }, 0);
      await vi.advanceTimersByTimeAsync(600);
      const tapped = await findAndTapPromise;

      expect(tapped).toBe(true);
      expect(adbShell).toHaveBeenCalledWith("SERIAL-1", "input tap 150 250");
      expect(adbShell).not.toHaveBeenCalledWith("SERIAL-1", "input tap 950 150");
    } finally {
      vi.useRealTimers();
    }
  });
});
