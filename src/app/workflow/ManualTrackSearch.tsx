"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { AppleMusicTrackMatch } from "@/lib/appleMusic";

import styles from "../page.module.css";

const SEARCH_DEBOUNCE_MS = 300;

type ManualTrackSearchProps = {
  autoFocus?: boolean;
  catalogLabel?: string;
  onApply: (track: AppleMusicTrackMatch) => void;
  onSearch: (query: string) => Promise<AppleMusicTrackMatch[]>;
  placeholder?: string;
};

export function ManualTrackSearch({
  autoFocus = false,
  catalogLabel = "Apple Music",
  onApply,
  onSearch,
  placeholder = "Search for a song",
}: ManualTrackSearchProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppleMusicTrackMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  onSearchRef.current = onSearch;

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestIdRef.current += 1;
      setResults([]);
      setHasSearched(false);
      setErrorMessage(null);
      setIsSearching(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setErrorMessage(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const tracks = await onSearchRef.current(trimmed);
          if (requestId !== requestIdRef.current) {
            return;
          }
          setResults(tracks);
          setHasSearched(true);
        } catch (error) {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setResults([]);
          setHasSearched(true);
          setErrorMessage(
            error instanceof Error ? error.message : `Unable to search ${catalogLabel}.`,
          );
        } finally {
          if (requestId === requestIdRef.current) {
            setIsSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [catalogLabel, query]);

  return (
    <div className={styles.manualSearch}>
      <div className={styles.manualSearchField}>
        <span aria-hidden="true" className={styles.manualSearchIcon}>
          <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M16.5 16.5 20 20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.75"
            />
          </svg>
        </span>
        <label className={styles.visuallyHidden} htmlFor={inputId}>
          Search {catalogLabel}
        </label>
        <input
          id={inputId}
          placeholder={placeholder}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {isSearching ? (
          <span aria-live="polite" className={styles.manualSearchStatus}>
            Searching...
          </span>
        ) : null}
      </div>
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      {hasSearched && !isSearching && !errorMessage && results.length === 0 ? (
        <p className={styles.manualSearchEmpty}>No {catalogLabel} tracks found.</p>
      ) : null}
      {results.length > 0 ? (
        <ul className={styles.manualSearchResults}>
          {results.map((track) => (
            <li className={styles.manualSearchResult} key={track.id}>
              <div className={styles.manualSearchResultMeta}>
                <strong>{track.name}</strong>
                <p>{track.artistName}</p>
                {track.albumName ? <p>{track.albumName}</p> : null}
              </div>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => onApply(track)}
              >
                Use this match
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
