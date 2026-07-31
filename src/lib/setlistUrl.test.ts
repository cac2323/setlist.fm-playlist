import { describe, expect, it } from "vitest";

import { parseSetlistUrl } from "./setlistUrl";

describe("parseSetlistUrl", () => {
  it("extracts the setlist id from a setlist.fm URL", () => {
    expect(
      parseSetlistUrl(
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      ),
    ).toEqual({
      id: "3b497c60",
      url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });
  });

  it("allows the bare setlist.fm hostname", () => {
    expect(
      parseSetlistUrl(
        "https://setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3B497C60.html",
      ).id,
    ).toBe("3b497c60");
  });

  it("rejects empty input", () => {
    expect(() => parseSetlistUrl("")).toThrow("Enter a setlist.fm URL.");
  });

  it("rejects malformed URLs", () => {
    expect(() => parseSetlistUrl("not a url")).toThrow("Enter a valid URL.");
  });

  it("rejects non-setlist.fm URLs", () => {
    expect(() =>
      parseSetlistUrl(
        "https://example.com/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      ),
    ).toThrow("Enter a URL from setlist.fm.");
  });

  it("rejects setlist.fm pages that are not setlist pages", () => {
    expect(() => parseSetlistUrl("https://www.setlist.fm/search?artist=jayz")).toThrow(
      "Enter a setlist.fm setlist page URL.",
    );
  });
});
