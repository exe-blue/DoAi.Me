import { describe, it, expect } from "vitest";
import { formatDuration, formatSubscriberCount } from "@/lib/youtube";

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration("PT45S")).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration("PT3M27S")).toBe("3:27");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration("PT1H5M30S")).toBe("1:05:30");
  });

  it("formats minutes only", () => {
    expect(formatDuration("PT10M")).toBe("10:00");
  });

  it("returns 0:00 for invalid input", () => {
    expect(formatDuration("invalid")).toBe("0:00");
    expect(formatDuration("")).toBe("0:00");
  });

  it("formats zero duration", () => {
    expect(formatDuration("PT0S")).toBe("0:00");
  });

  it("pads seconds with leading zero", () => {
    expect(formatDuration("PT1M5S")).toBe("1:05");
  });

  it("pads minutes in hour format", () => {
    expect(formatDuration("PT2H3M0S")).toBe("2:03:00");
  });
});

describe("formatSubscriberCount", () => {
  it("formats numbers under 10,000 with comma separator", () => {
    expect(formatSubscriberCount(1500)).toBe("1,500");
  });

  it("formats exact 만 values", () => {
    expect(formatSubscriberCount(50000)).toBe("5만");
  });

  it("formats 만 values with decimal", () => {
    expect(formatSubscriberCount(15000)).toBe("1.5만");
  });

  it("formats large numbers in 만 units with commas", () => {
    expect(formatSubscriberCount(76400000)).toBe("7,640만");
  });

  it("formats small numbers", () => {
    expect(formatSubscriberCount(0)).toBe("0");
    expect(formatSubscriberCount(999)).toBe("999");
  });

  it("formats exactly 10,000", () => {
    expect(formatSubscriberCount(10000)).toBe("1만");
  });
});
