import { describe, expect, it } from "vitest";

import {
  getComparableTitleSegments,
  getRemixDescriptor,
  getSearchableSongTitle,
  getSearchableTitle,
  normalizeComparableText,
  scoreAppleMusicCandidate,
  scoreTextSimilarity,
  selectBestAppleMusicMatch,
  selectTitleOnlyAppleMusicMatch,
} from "./appleMusicMatching";

describe("Apple Music matching utilities", () => {
  it("normalizes punctuation, accents, parentheticals, and featured artists", () => {
    expect(normalizeComparableText("Encore (feat. Linkin Park)")).toBe("encore");
    expect(normalizeComparableText("Beyoncé & Jay-Z")).toBe("beyonce and jay z");
  });

  it("treats possessive apostrophes as part of the word for title matching", () => {
    expect(normalizeComparableText("Ruff Ryder's Anthem")).toBe(
      normalizeComparableText("Ruff Ryders' Anthem"),
    );
    expect(normalizeComparableText("Ruff Ryder's Anthem")).toBe("ruff ryders anthem");
    expect(getSearchableTitle("Ruff Ryder's Anthem")).toBe("Ruff Ryders Anthem");
    expect(scoreTextSimilarity("Ruff Ryder's Anthem", "Ruff Ryders Anthem")).toBe(1);
  });

  it("normalizes censored and uncensored profanity to the same comparable title", () => {
    expect(normalizeComparableText("Ni**a What, Ni**a Who")).toBe(
      normalizeComparableText("Nigga What, Nigga Who (Originator 99)"),
    );
    expect(getSearchableTitle("Ni**a What, Ni**a Who")).toBe("Nigga What, Nigga Who");
    expect(normalizeComparableText("Ni**as in Paris")).toBe(
      normalizeComparableText("Niggas in Paris"),
    );
    expect(getSearchableTitle("Ni**as in Paris")).toBe("Niggas in Paris");
    expect(normalizeComparableText("fuckwithmeyouknowigotit")).toBe(
      normalizeComparableText("F*ckwithmeyouknowigotit"),
    );
    expect(getSearchableTitle("fuckwithmeyouknowigotit")).toBe("f*ckwithmeyouknowigotit");
    expect(getSearchableTitle("F*ckwithmeyouknowigotit")).toBe("f*ckwithmeyouknowigotit");
    expect(normalizeComparableText("Holy Sh*t")).toBe(normalizeComparableText("Holy Shit"));
    expect(getSearchableTitle("Holy Shit")).toBe("Holy sh*t");
    expect(normalizeComparableText("Son of a B*tch")).toBe(
      normalizeComparableText("Son of a Bitch"),
    );
    expect(scoreTextSimilarity("fuckwithmeyouknowigotit", "F*ckwithmeyouknowigotit")).toBe(1);
  });

  it("matches an Apple Music asterisk-censored glued title", () => {
    const { bestCandidate } = selectBestAppleMusicMatch(
      { artistName: "Jay-Z", name: "fuckwithmeyouknowigotit", position: 1 },
      [
        {
          albumName: "Magna Carta... Holy Grail",
          artistName: "JAY-Z",
          id: "fuckwithme-track",
          name: "F*ckwithmeyouknowigotit",
        },
      ],
    );

    expect(bestCandidate?.id).toBe("fuckwithme-track");
    expect(bestCandidate?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(bestCandidate?.reasons).toContain("Exact title match");
  });

  it("extracts spaced slash title segments without splitting an unspaced slash", () => {
    expect(getComparableTitleSegments("Girls, Girls, Girls / '03 Bonnie & Clyde")).toEqual([
      "Girls, Girls, Girls",
      "'03 Bonnie & Clyde",
    ]);
    expect(getComparableTitleSegments("AC/DC")).toEqual(["AC/DC"]);
  });

  it("uses recognized remix metadata in search titles", () => {
    expect(getRemixDescriptor("(Four Tet Remix)")).toBe("Four Tet Remix");
    expect(
      getRemixDescriptor('contains elements from "Stateside + Zara Larsson" remix'),
    ).toBeNull();
    expect(
      getSearchableSongTitle({
        artistName: "PinkPantheress",
        info: "Four Tet Remix",
        name: "Illegal",
        position: 1,
      }),
    ).toBe("Illegal Four Tet Remix");
    expect(
      getSearchableSongTitle({
        artistName: "PinkPantheress",
        info: 'contains elements from "Stars + DJ Caio Prince + Adame Dj" remix',
        name: "Stars",
        position: 2,
      }),
    ).toBe("Stars");
  });

  it("scores exact and partial text matches", () => {
    expect(scoreTextSimilarity("Run This Town", "Run This Town")).toBe(1);
    expect(scoreTextSimilarity("Run This Town", "Run This Town - Remastered")).toBeGreaterThan(
      0.7,
    );
  });

  it("scores candidate title and artist matches", () => {
    const scoredCandidate = scoreAppleMusicCandidate(
      { artistName: "Jay-Z", name: "Encore", position: 1 },
      { artistName: "JAY-Z", id: "1", name: "Encore" },
    );

    expect(scoredCandidate.confidence).toBeGreaterThanOrEqual(0.9);
    expect(scoredCandidate.reasons).toContain("Exact title match");
    expect(scoredCandidate.reasons).toContain("Artist match");
  });

  it("penalizes unexpected variant candidates", () => {
    const scoredCandidate = scoreAppleMusicCandidate(
      { artistName: "Jay-Z", name: "Encore", position: 1 },
      { albumName: "Karaoke Hits", artistName: "JAY-Z", id: "1", name: "Encore - Karaoke" },
    );

    expect(scoredCandidate.confidence).toBeLessThan(0.9);
    expect(scoredCandidate.reasons).toContain("Penalized variant: karaoke");
  });

  it("selects the first popular title-only candidate when artist is ignored", () => {
    const placeholder = selectTitleOnlyAppleMusicMatch(
      { artistName: "Mereba", name: "You Send Me", position: 1 },
      [
        {
          artistName: "Sam Cooke",
          id: "sam-cooke",
          name: "You Send Me",
        },
        {
          artistName: "Aretha Franklin",
          id: "aretha",
          name: "You Send Me",
        },
      ],
    );

    expect(placeholder?.id).toBe("sam-cooke");
    expect(placeholder?.reasons).toContain("Needs review");
    expect(placeholder?.reasons).toContain("Popular title match — artist not confirmed");
  });

  it("prefers the strongest title-only match over a weaker earlier Apple result", () => {
    const placeholder = selectTitleOnlyAppleMusicMatch(
      { artistName: "Jay-Z", name: "Ruff Ryder's Anthem", position: 1 },
      [
        {
          artistName: "Sammy SlamDance & Abyss Walker",
          id: "obscure-track",
          name: "Ruff Rider Theme",
        },
        {
          artistName: "DMX",
          id: "dmx-track",
          name: "Ruff Ryders' Anthem",
        },
      ],
    );

    expect(placeholder?.id).toBe("dmx-track");
  });

  it("requires the requested remix rather than selecting the original", () => {
    const setlistSong = {
      artistName: "PinkPantheress",
      info: "Nia Archives remix",
      name: "Illegal",
      position: 1,
    };
    const original = scoreAppleMusicCandidate(setlistSong, {
      artistName: "PinkPantheress",
      id: "original",
      name: "Illegal",
    });
    const requestedRemix = scoreAppleMusicCandidate(setlistSong, {
      artistName: "PinkPantheress",
      id: "nia-remix",
      name: "Illegal (Nia Archives Remix)",
    });

    expect(original.confidence).toBeLessThan(0.72);
    expect(original.reasons).toContain("Missing requested remix");
    expect(requestedRemix.confidence).toBeGreaterThan(0.9);
    expect(requestedRemix.reasons).toContain("Requested remix match");
  });

  it("selects the highest-confidence candidate and alternatives", () => {
    const result = selectBestAppleMusicMatch(
      { artistName: "Jay-Z", name: "Encore", position: 1 },
      [
        { artistName: "Karaoke Band", id: "bad", name: "Encore" },
        { artistName: "JAY-Z", id: "good", name: "Encore" },
      ],
    );

    expect(result.bestCandidate?.id).toBe("good");
    expect(result.alternatives[0].id).toBe("bad");
  });
});
