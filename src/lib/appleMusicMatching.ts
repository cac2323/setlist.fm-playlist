import type { AppleMusicTrackMatch } from "./appleMusic";
import type { NormalizedSetlistSong } from "./setlistfm";

export type ScoredAppleMusicTrackMatch = AppleMusicTrackMatch & {
  confidence: number;
  reasons: string[];
};

const LOW_CONFIDENCE_PENALTY_TERMS = [
  "commentary",
  "instrumental",
  "karaoke",
  "live",
  "remix",
  "tribute",
];

const HIGH_CONFIDENCE_THRESHOLD = 0.72;
const MULTI_TITLE_SEPARATOR = /\s+\/\s+/;

function normalizeCensoredWords(value: string) {
  return value
    .replace(/\bnigg(?:a|er)s?\b/gi, " nword ")
    .replace(/\bn(?:i|\*)[ig*#@!$%]{2,4}as?\b/gi, " nword ")
    // Glued titles like f*ckwithmeyouknowigotit need mid-string matching.
    .replace(/f(?:u|[*#@!$%]+)c?k/gi, "fuck")
    .replace(/sh[*#@!$%]+t/gi, "shit")
    .replace(/b[*#@!$%]+tch/gi, "bitch");
}

export function getSearchableTitle(value: string) {
  return value
    .replace(/\bn(?:i|\*)[ig*#@!$%]{2,4}a(s?)\b/gi, "Nigga$1")
    // Apple Music commonly stores these roots in asterisk-censored form.
    .replace(/f(?:u|[*#@!$%]+)c?k/gi, "f*ck")
    .replace(/sh[*#@!$%]+t/gi, "sh*t")
    .replace(/\bshit\b/gi, "sh*t")
    .replace(/b[*#@!$%]+tch/gi, "b*tch")
    .replace(/\bbitch\b/gi, "b*tch")
    // Keep letters from possessives joined: "Ryder's" -> "Ryders".
    .replace(/['’]/g, "");
}

function normalizeVariantText(value: string) {
  return normalizeCensoredWords(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function getRemixDescriptor(info?: string) {
  if (
    !info ||
    !/\bremix\b/i.test(info) ||
    /\bcontains?\s+(?:elements?|parts?)\s+from\b/i.test(info)
  ) {
    return null;
  }

  return info.trim().replace(/^\((.*)\)$/, "$1");
}

export function getSearchableSongTitle(song: NormalizedSetlistSong) {
  const title = getSearchableTitle(song.name);
  const remixDescriptor = getRemixDescriptor(song.info);

  return remixDescriptor ? `${title} ${remixDescriptor}` : title;
}

export function normalizeComparableText(value: string) {
  return normalizeCensoredWords(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\b(feat|featuring|ft)\.?\b.*$/i, " ")
    // Keep letters from possessives joined: "Ryder's" -> "Ryders".
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\bthe\b/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function getComparableTitleSegments(value: string) {
  const segments = value
    .split(MULTI_TITLE_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => normalizeComparableText(segment).length > 0);

  return segments.length > 1 ? segments : [value.trim()];
}

export function scoreTextSimilarity(sourceValue: string, candidateValue: string) {
  const source = normalizeComparableText(sourceValue);
  const candidate = normalizeComparableText(candidateValue);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1;
  }

  if (source.includes(candidate) || candidate.includes(source)) {
    return 0.88;
  }

  const sourceTokens = new Set(source.split(" "));
  const candidateTokens = new Set(candidate.split(" "));
  const sharedTokenCount = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
  const totalTokenCount = new Set([...sourceTokens, ...candidateTokens]).size;

  return totalTokenCount === 0 ? 0 : sharedTokenCount / totalTokenCount;
}

function hasVariantHint(song: NormalizedSetlistSong) {
  return normalizeComparableText(`${song.name} ${song.info ?? ""}`)
    .split(" ")
    .some((token) => LOW_CONFIDENCE_PENALTY_TERMS.includes(token));
}

function getPenaltyTerms(candidate: AppleMusicTrackMatch) {
  const comparableCandidateText = normalizeVariantText(
    `${candidate.name} ${candidate.albumName ?? ""}`,
  );

  return LOW_CONFIDENCE_PENALTY_TERMS.filter((term) =>
    comparableCandidateText.split(" ").includes(term),
  );
}

export function scoreAppleMusicCandidate(
  setlistSong: NormalizedSetlistSong,
  candidate: AppleMusicTrackMatch,
): ScoredAppleMusicTrackMatch {
  const titleScore = scoreTextSimilarity(setlistSong.name, candidate.name);
  const expectedArtistName = setlistSong.coverArtistName ?? setlistSong.artistName;
  const artistScore = scoreTextSimilarity(expectedArtistName, candidate.artistName);
  const reasons: string[] = [];
  const penaltyTerms = getPenaltyTerms(candidate);
  const variantPenalty = penaltyTerms.length > 0 && !hasVariantHint(setlistSong) ? 0.18 : 0;
  const requestedRemix = getRemixDescriptor(setlistSong.info);
  const requestedRemixTokens = requestedRemix
    ? normalizeVariantText(requestedRemix)
        .split(" ")
        .filter((token) => token !== "remix")
    : [];
  const candidateVariantTokens = normalizeVariantText(
    `${candidate.name} ${candidate.albumName ?? ""}`,
  ).split(" ");
  const candidateIsRemix = candidateVariantTokens.includes("remix");
  const matchesRequestedRemix =
    requestedRemix !== null &&
    candidateIsRemix &&
    (requestedRemixTokens.length === 0 ||
      requestedRemixTokens.every((token) => candidateVariantTokens.includes(token)));
  const requestedRemixPenalty =
    requestedRemix === null ? 0 : matchesRequestedRemix ? 0 : candidateIsRemix ? 0.35 : 0.32;

  if (titleScore === 1) {
    reasons.push("Exact title match");
  } else if (titleScore >= 0.78) {
    reasons.push("Strong title match");
  }

  if (artistScore === 1) {
    reasons.push(setlistSong.coverArtistName ? "Cover artist match" : "Artist match");
  } else if (artistScore >= 0.78) {
    reasons.push("Strong artist match");
  }

  if (variantPenalty > 0) {
    reasons.push(`Penalized variant: ${penaltyTerms.join(", ")}`);
  }

  if (matchesRequestedRemix) {
    reasons.push("Requested remix match");
  } else if (requestedRemixPenalty > 0) {
    reasons.push(candidateIsRemix ? "Different remix" : "Missing requested remix");
  }

  const confidence = Math.max(
    0,
    Math.min(
      1,
      titleScore * 0.7 +
        artistScore * 0.3 -
        variantPenalty -
        requestedRemixPenalty,
    ),
  );

  return {
    ...candidate,
    confidence,
    reasons,
  };
}

export function selectBestAppleMusicMatch(
  setlistSong: NormalizedSetlistSong,
  candidates: AppleMusicTrackMatch[],
) {
  const scoredCandidates = candidates
    .map((candidate) => scoreAppleMusicCandidate(setlistSong, candidate))
    .sort((left, right) => right.confidence - left.confidence);
  const [bestCandidate, ...alternatives] = scoredCandidates;

  return {
    alternatives,
    bestCandidate:
      bestCandidate && bestCandidate.confidence >= HIGH_CONFIDENCE_THRESHOLD ? bestCandidate : null,
  };
}

export function selectTitleOnlyAppleMusicMatch(
  setlistSong: NormalizedSetlistSong,
  candidates: AppleMusicTrackMatch[],
): ScoredAppleMusicTrackMatch | null {
  // Prefer the strongest title match; break ties with Apple's popularity order.
  const rankedCandidates = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      titleScore: scoreTextSimilarity(setlistSong.name, candidate.name),
    }))
    .filter(({ titleScore }) => titleScore >= HIGH_CONFIDENCE_THRESHOLD)
    .sort((left, right) => {
      if (right.titleScore !== left.titleScore) {
        return right.titleScore - left.titleScore;
      }

      return left.index - right.index;
    });

  const bestCandidate = rankedCandidates[0];

  if (!bestCandidate) {
    return null;
  }

  return {
    ...bestCandidate.candidate,
    confidence: bestCandidate.titleScore,
    reasons: ["Needs review", "Popular title match — artist not confirmed"],
  };
}
