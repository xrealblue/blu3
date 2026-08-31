"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Track } from "@/utils/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PlaylistsContextType {
  likedTrackIds: Set<string>;
  toggleLike: (track: Track) => Promise<void>;
  loading: boolean;
  refreshLikedIds: () => Promise<void>;
}

const PlaylistsContext = createContext<PlaylistsContextType | undefined>(undefined);

export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refreshLikedIds = useCallback(async () => {
    const token = localStorage.getItem("blu3_token");
    if (!token) {
      setLikedTrackIds(new Set());
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/playlists/liked/ids`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ids) {
        setLikedTrackIds(new Set(data.ids));
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLikedIds();
  }, [refreshLikedIds]);

  const toggleLike = useCallback(async (track: Track) => {
    const token = localStorage.getItem("blu3_token");
    if (!token) return;

    const videoId = track.videoId;

    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });

    try {
      const artistName = track.artists?.map(a => a.name).join(", ") || "Unknown Artist";
      const res = await fetch(`${API_URL}/api/playlists/liked/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoId,
          trackName: track.name,
          artistName,
          image: track.image || "",
          durationMs: track.duration_ms || 0,
        }),
      });

      const data = await res.json();
      if (data.liked !== undefined) {
        setLikedTrackIds((prev) => {
          const next = new Set(prev);
          if (data.liked) {
            next.add(videoId);
          } else {
            next.delete(videoId);
          }
          return next;
        });
      }
    } catch (err) {
      refreshLikedIds();
    }
  }, [refreshLikedIds]);

  return (
    <PlaylistsContext.Provider value={{ likedTrackIds, toggleLike, loading, refreshLikedIds }}>
      {children}
    </PlaylistsContext.Provider>
  );
}

export function usePlaylists() {
  const context = useContext(PlaylistsContext);
  if (context === undefined) {
    throw new Error("usePlaylists must be used within a PlaylistsProvider");
  }
  return context;
}
