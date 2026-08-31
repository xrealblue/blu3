"use client";

import { useCallback, useRef, useState } from "react";
import type { Track, SearchResponse } from "../utils/types";
import { CONFIG } from "@/components/Player/constants";

export function useSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResponse = await res.json();

      if (data.error) throw new Error(data.error);
      setResults(data.tracks ?? []);
    } catch (err) {
      setSearchError("Search failed. Is the backend running?");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const onSearchInput = useCallback(
    (val: string) => {
      setSearchQuery(val);

      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }

      searchTimeout.current = setTimeout(() => {
        doSearch(val);
      }, CONFIG.DEBOUNCE_SEARCH_MS);
    },
    [doSearch],
  );

  return {
    searchQuery,
    results,
    isSearching,
    searchError,
    setSearchQuery,
    setResults,
    doSearch,
    onSearchInput,
  };
}
