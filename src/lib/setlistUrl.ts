export type ParsedSetlistUrl = {
  id: string;
  url: string;
};

const SETLIST_PATH_PATTERN = /^\/setlist\/.+\/[a-z0-9-]+-([a-f0-9]+)\.html$/i;

export function parseSetlistUrl(value: string): ParsedSetlistUrl {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error("Enter a setlist.fm URL.");
  }

  let url: URL;

  try {
    url = new URL(trimmedValue);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (url.hostname !== "www.setlist.fm" && url.hostname !== "setlist.fm") {
    throw new Error("Enter a URL from setlist.fm.");
  }

  const match = url.pathname.match(SETLIST_PATH_PATTERN);

  if (!match) {
    throw new Error("Enter a setlist.fm setlist page URL.");
  }

  return {
    id: match[1].toLowerCase(),
    url: url.toString(),
  };
}
