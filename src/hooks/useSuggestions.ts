"use client";

import { useCallback, useState, useRef } from "react";
import { CONFIG } from "@/components/Player/constants";

export function useSuggestions(apiUrl: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }

    setSuggestions([]);
  }, []);

  const onSuggestInput = useCallback(
    (val: string) => {
      if (suggestTimeout.current) {
        clearTimeout(suggestTimeout.current);
      }

      suggestTimeout.current = setTimeout(() => {
        fetchSuggestions(val);
      }, CONFIG.DEBOUNCE_SUGGEST_MS);
    },
    [fetchSuggestions],
  );

  const hideSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  return {
    suggestions,
    showSuggestions,
    fetchSuggestions,
    onSuggestInput,
    hideSuggestions,
    setShowSuggestions,
  };
}
