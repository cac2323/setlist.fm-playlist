import "server-only";

import { z } from "zod";

import { apiDebug } from "./debug";

const SETLISTFM_API_BASE_URL = "https://api.setlist.fm/rest/1.0";

const setlistFmSongSchema = z.object({
  name: z.string(),
  cover: z
    .object({
      name: z.string(),
    })
    .optional(),
  info: z.string().optional(),
});

const setlistFmSetSchema = z.object({
  song: z.array(setlistFmSongSchema).optional(),
});

const setlistFmResponseSchema = z.object({
  id: z.string(),
  eventDate: z.string().optional(),
  artist: z.object({
    name: z.string(),
  }),
  venue: z
    .object({
      name: z.string(),
      city: z
        .object({
          name: z.string(),
          stateCode: z.string().optional(),
          country: z
            .object({
              code: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  sets: z
    .object({
      set: z.array(setlistFmSetSchema).optional(),
    })
    .optional(),
});

export type NormalizedSetlistSong = {
  artistName: string;
  coverArtistName?: string;
  info?: string;
  name: string;
  position: number;
};

export type NormalizedSetlist = {
  artistName: string;
  eventDate?: string;
  id: string;
  songs: NormalizedSetlistSong[];
  venue?: {
    cityName?: string;
    countryCode?: string;
    name: string;
    stateCode?: string;
  };
};

type SetlistFmResponse = z.infer<typeof setlistFmResponseSchema>;

export class SetlistFmApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SetlistFmApiError";
  }
}

export function normalizeSetlist(setlist: SetlistFmResponse): NormalizedSetlist {
  const songs =
    setlist.sets?.set?.flatMap((set) => set.song ?? []).map((song, index) => ({
      artistName: setlist.artist.name,
      coverArtistName: song.cover?.name,
      info: song.info,
      name: song.name,
      position: index + 1,
    })) ?? [];

  return {
    artistName: setlist.artist.name,
    eventDate: setlist.eventDate,
    id: setlist.id,
    songs,
    venue: setlist.venue
      ? {
          cityName: setlist.venue.city?.name,
          countryCode: setlist.venue.city?.country?.code,
          name: setlist.venue.name,
          stateCode: setlist.venue.city?.stateCode,
        }
      : undefined,
  };
}

export async function fetchSetlistById(id: string): Promise<NormalizedSetlist> {
  const apiKey = process.env.SETLISTFM_API_KEY;
  const url = `${SETLISTFM_API_BASE_URL}/setlist/${encodeURIComponent(id)}`;

  if (!apiKey) {
    apiDebug("Missing setlist.fm API key", {
      method: "GET",
      url,
    });
    throw new SetlistFmApiError("Missing SETLISTFM_API_KEY.");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const responseText = await response.text();

    apiDebug("setlist.fm API request failed", {
      method: "GET",
      responseBody: responseText,
      status: response.status,
      statusText: response.statusText,
      url,
    });

    throw new SetlistFmApiError("Unable to fetch that setlist.", response.status);
  }

  const responseBody: unknown = await response.json();
  const parsedResponse = setlistFmResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    apiDebug("setlist.fm API response validation failed", {
      method: "GET",
      issues: parsedResponse.error.issues,
      responseBody,
      url,
    });

    throw new SetlistFmApiError("setlist.fm returned an unexpected response.");
  }

  return normalizeSetlist(parsedResponse.data);
}
