"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track, PlayerState as PlayerStateType } from "../utils/types";
import { CONFIG } from "@/components/Player/constants";
import { onVisibilityChange } from "@/utils/visibilityCoordinator";

export interface MediaSessionCallbacks {
  onNext?: () => void;
  onPrev?: () => void;
  onSeekTo?: (time: number) => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
}

interface UsePlayerStateReturn {
  playerState: PlayerStateType;
  volume: number;
  isMuted: boolean;
  nowPlaying: Track | null;
  activeSource: string;
  activeVideoId: string | null;
  error: string;
  playing: boolean;
  pendingStartTimeRef: React.MutableRefObject<number>;
  mediaSessionCbsRef: React.MutableRefObject<MediaSessionCallbacks | null>;
  playTrack: (track: Track, startTime?: number, shouldPlay?: boolean) => void;
  togglePlayPause: () => void;
  handleVolume: (val: number) => void;
  toggleMute: () => void;
  setError: (msg: string) => void;
  setNowPlaying: (track: Track | null) => void;
  setPlayerState: (state: PlayerStateType) => void;
  play: () => void;
  pause: () => void;
  handleReady: () => void;
  handlePlayEvent: () => void;
  handlePauseEvent: () => void;
  handleEnded: () => void;
  handleError: (e: any) => void;
}

export function usePlayerState(): UsePlayerStateReturn {
  const [playerState, setPlayerState] = useState<PlayerStateType>("idle");
  const [volume, setVolume] = useState(CONFIG.DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<Track | null>(null);
  const [activeSource, setActiveSource] = useState<string>("youtube");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);

  const nowPlayingRef = useRef(nowPlaying);
  nowPlayingRef.current = nowPlaying;
  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;
  const activeVideoIdRef = useRef(activeVideoId);
  activeVideoIdRef.current = activeVideoId;
  const pendingStartTimeRef = useRef(0);
  const mediaSessionCbsRef = useRef<MediaSessionCallbacks | null>(null);

  const playTrack = useCallback(
    (track: Track, startTime?: number, shouldPlay: boolean = true) => {
      setError("");
      setNowPlaying(track);
      setActiveSource(track.source ?? "youtube");
      setActiveVideoId(track.videoId);
      pendingStartTimeRef.current = startTime ?? 0;

      if (!track.videoId) {
        setPlayerState("error");
        setError("No video ID.");
        return;
      }

      setPlayerState("loading");
      setPlaying(shouldPlay);
    },
    [],
  );

  const play = useCallback(() => {
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      playerState === "playing" ? "playing"
      : playerState === "paused" ? "paused"
      : "none";
  }, [playerState]);

  const lastMetadataVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (playerState !== "playing" || !nowPlaying) {
      if (!nowPlaying) lastMetadataVideoIdRef.current = null;
      return;
    }
    if (nowPlaying.videoId && nowPlaying.videoId === lastMetadataVideoIdRef.current) return;
    lastMetadataVideoIdRef.current = nowPlaying.videoId;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.name || "Unknown",
        artist: nowPlaying.artists?.[0]?.name || "Unknown",
        album: nowPlaying.album?.name || "",
        artwork: nowPlaying.image
          ? [{ src: nowPlaying.image, sizes: "512x512", type: "image/png" }]
          : [],
      });
    } catch {}
  }, [playerState, nowPlaying]);

  const togglePlayPause = useCallback(() => {
    const id = nowPlayingRef.current?.videoId;
    if (!id) return;
    if (playerStateRef.current === "playing") {
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  }, []);

  const handleVolume = useCallback(
    (val: number) => {
      setVolume(val);
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        setIsMuted(false);
      }
    },
    [isMuted],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  const handleReady = useCallback(() => {
  }, []);

  const handlePlayEvent = useCallback(() => {
    setPlayerState("playing");
  }, []);

  const handlePauseEvent = useCallback(() => {
    setPlayerState("paused");
  }, []);

  const handleEnded = useCallback(() => {
    setPlayerState("ended");
  }, []);

  const handleError = useCallback((e: any) => {
    setError(`Player error`);
    setPlayerState("error");
  }, []);

  useEffect(() => {
    const unsub = onVisibilityChange((visible) => {
      if (!visible) return;
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.playbackState =
        playerState === "playing" ? "playing"
        : playerState === "paused" ? "paused"
        : "none";
    });
    return unsub;
  }, [playerState]);

  return {
    playerState,
    volume,
    isMuted,
    nowPlaying,
    activeSource,
    activeVideoId,
    error,
    playing,
    pendingStartTimeRef,
    mediaSessionCbsRef,
    playTrack,
    togglePlayPause,
    handleVolume,
    toggleMute,
    setError,
    setNowPlaying,
    setPlayerState,
    play,
    pause,
    handleReady,
    handlePlayEvent,
    handlePauseEvent,
    handleEnded,
    handleError,
  };
}
