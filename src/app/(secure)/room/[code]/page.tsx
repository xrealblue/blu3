"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { useAuth } from "@/hooks/useAuth";
import { usePlayerState } from "@/hooks/usePlayerState";
import { usePlayerEngine } from "@/hooks/usePlayerEngine";
import { resolveLink } from "@/utils/ytdl";

import { useSearch } from "@/hooks/useSearch";
import { useSuggestions } from "@/hooks/useSuggestions";
import { onVisibilityChange } from "@/utils/visibilityCoordinator";
import { RoomBackground } from "@/components/Player/ui/RoomBackground";
import { Track, PlayerState } from "@/utils/types";
import {
  asTrackFromPlayback,
  asTrackFromRecent,
  RoomTheme,
} from "@/utils/roomHelpers";
import { usePlaylists } from "@/hooks/usePlaylists";
import { RightSidebar } from "@/components/Player/ui/RightSidebar";
import { RoomLoading } from "@/components/Player/ui/RoomLoading";
import { SearchOverlay } from "@/components/Player/ui/SearchOverlay";
import { SquarePlayer } from "@/components/Player/ui/SquarePlayer";
import { RoomStars } from "@/components/Player/ui/RoomStars";
import { RoomTopSection } from "@/components/Player/ui/RoomTopSection";
import { RoomFooter } from "@/components/Player/ui/RoomFooter";
import { QueueToast } from "@/components/Player/ui/QueueToast";
import { RoomErrorModal } from "@/components/Player/ui/RoomErrorModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type RepeatMode = "off" | "all" | "one";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queuePlaylistId = searchParams
    ? searchParams.get("queuePlaylistId")
    : null;
  const code = (params.code as string)?.toUpperCase();

  const { user, loading: authLoading, logout } = useAuth();
  const { room, joinRoom, leaveRoom } = useRoom();
  const setPlayerStateRef = useRef<((s: PlayerState) => void) | null>(null);

  const player = usePlayerState();
  setPlayerStateRef.current = player.setPlayerState;
  const token =
    typeof window !== "undefined"
      ? (localStorage.getItem("blu3_token") ?? undefined)
      : undefined;

  const engine = usePlayerEngine({
    token,
    nowPlaying: player.nowPlaying,
    isPlaying: player.playing,
    volume: player.volume,
    isMuted: player.isMuted,
    pendingStartTimeRef: player.pendingStartTimeRef,
    onPlay: () => player.handlePlayEvent(),
    onPause: () => player.handlePauseEvent(),
    onTrackEnd: () => {
      player.setPlayerState("ended");
    },
  });
  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const { likedTrackIds, toggleLike } = usePlaylists();
  const searchState = useSearch();
  const suggestState = useSuggestions(API_URL);

  const [chatInput, setChatInput] = useState("");
  const [joined, setJoined] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [roomTheme, setRoomTheme] = useState<RoomTheme>("purple");
  const [listenerMuted, setListenerMuted] = useState(false);
  const [joinToasts, setJoinToasts] = useState<
    Array<{ id: string; name: string; avatar?: string }>
  >([]);
  const [queueToast, setQueueToast] = useState<{
    playlistName: string;
    image: string;
    trackCount: number;
  } | null>(null);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);
  const [starsMounted, setStarsMounted] = useState(false);

  useEffect(() => {
    setStarsMounted(true);
  }, []);

  const originalQueueRef = useRef<Track[]>([]);

  const {
    connected,
    initialDataLoaded,
    isHost: socketIsHost,
    isHostActive,
    members,
    playback,
    playbackMode,
    messages,
    recentTracks,
    queue,
    setQueue,
    sendChat,
    sendPlay,
    sendPause,
    sendSeek,
    sendPlaybackMode,
    sendProgress,
    sendTrackEnded,
    getSyncedTime,
    getSyncedPosition,
    requestSync,
    addToQueue,
    removeFromQueue,
    cycleQueueCurrent,
    clearQueue,
    unreadChatCount,
    resetUnreadChat,
  } = useRoomSocket({
    roomCode: joined ? code : null,
    chatOpen,
    onPlay: (state) => handlePlay(state),
    onPause: (state) => handlePause(state),
    onSeek: (state) => handleSeek(state),
    onPreResolved: (videoId, audioUrl) => {
      engineRef.current?.cacheResolvedUrl(videoId, audioUrl);
      engineRef.current?.preloadAudioData(audioUrl);
    },
    onPlaybackSync: (state, syncedTime) => {
      if (!state.videoId) {
        if (playerRef_fix.current.playerState !== "idle") {
          playerRef_fix.current.setPlayerState("idle");
          playerRef_fix.current.setNowPlaying(null);
          playerRef_fix.current.pause?.();
        }
        syncHandledRef.current = true;
        return;
      }
      syncHandledRef.current = true;
      let actualCurrentTime = state.currentTime ?? 0;
      const elapsedSinceSampled = state.updatedAt ? (syncedTime() - state.updatedAt) / 1000 : 0;
      if (elapsedSinceSampled > 0 && elapsedSinceSampled < 3600 && state.isPlaying) {
        actualCurrentTime += elapsedSinceSampled;
      }
      const p = playerRef_fix.current;
      if (p.nowPlaying?.videoId === state.videoId) {
        if (state.isPlaying) {
          if (p.playerState === "ended" || p.playerState === "loading") {
            p.play?.();
          } else {
            p.play?.();
          }
        } else {
          p.pause?.();
        }
      } else {
        p.playTrack(
          {
            id: `room-${state.videoId}`,
            source: (state as any).source ?? "youtube",
            videoId: state.videoId,
            name: state.trackName,
            duration_ms: 0,
            explicit: false,
            artists: [{ name: state.artistName }],
            album: { name: "" },
            image: state.image,
          },
          actualCurrentTime,
          state.isPlaying,
        );
        if (state.isPlaying) p.play?.();
      }
    },
    onMemberJoined: useCallback((user: { name: string; avatar?: string }) => {
      const toastId = Date.now().toString();
      setJoinToasts((prev) => [
        ...prev,
        { id: toastId, name: user.name, avatar: user.avatar },
      ]);
      setTimeout(() => {
        setJoinToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 3000);
    }, []),
  });

  // Auto-prefetch next track when this track starts playing
  useEffect(() => {
    if (
      (engine.mode === "audio" || engine.mode === "youtube") &&
      queue.length > 1
    ) {
      const nowPlaying = player.nowPlaying;
      const currentIdx = queue.findIndex(
        (t) => t.videoId === nowPlaying?.videoId,
      );
      const nextTrack =
        currentIdx >= 0 && currentIdx + 1 < queue.length
          ? queue[currentIdx + 1]
          : queue[0];
      if (nextTrack && nextTrack.videoId !== nowPlaying?.videoId) {
        engine.prefetchNextTrack(nextTrack);
      }
    }
  }, [
    engine.mode,
    queue,
    player.nowPlaying?.videoId,
    engine.prefetchNextTrack,
  ]);

  const playbackRef = useRef(playback);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    if (!connected || !joined || !queuePlaylistId) return;

    const token = localStorage.getItem("blu3_token");
    if (!token) return;

    fetch(`${API_URL}/api/playlists/${queuePlaylistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.tracks && data.tracks.length > 0) {
          data.tracks.forEach((t: any) => {
            const source =
              t.source || (/^\d+$/.test(t.videoId) ? "jiosaavn" : "youtube");
            addToQueue({
              id: t.id,
              source,
              videoId: t.videoId,
              name: t.trackName,
              artists: [{ name: t.artistName }],
              album: { name: "" },
              image: t.image || "",
              duration_ms: t.durationMs || 0,
              explicit: false,
            });
          });
        }
        const coverImage = data.tracks?.find((t: any) => t.image)?.image || "";
        setQueueToast({
          playlistName: data.playlist?.name || "Imported Playlist",
          image: coverImage,
          trackCount: data.tracks?.length || 0,
        });
        setTimeout(() => setQueueToast(null), 4000);
      })
      .catch(() => {})
      .finally(() => {
        router.replace(`/room/${code}`);
      });
  }, [connected, joined, queuePlaylistId, code, addToQueue, router]);

  const isHost = room?.hostId === user?.id || socketIsHost;
  const canControlPlayback = isHost || !isHostActive || user?.role === "admin";
  const queueAdvanceLockRef = useRef<string | null>(null);
  const syncHandledRef = useRef(false);
  const joinedRef = useRef(joined);
  joinedRef.current = joined;
  const canControlPlaybackRef = useRef(canControlPlayback);
  const playerRef_fix = useRef(player);
  useEffect(() => {
    canControlPlaybackRef.current = canControlPlayback;
  }, [canControlPlayback]);
  useEffect(() => {
    playerRef_fix.current = player;
  }, [player]);

  const playbackTrack = asTrackFromPlayback(playback);
  const lastPlayedTrack = asTrackFromRecent(recentTracks[0]);
  const footerTrack = player.nowPlaying ?? playbackTrack ?? lastPlayedTrack;
  const nextTrack = (() => {
    const playingId = player.nowPlaying?.videoId || player.nowPlaying?.id;
    if (!playingId) return queue[0] || null;
    const idx = queue.findIndex(
      (t) => t.videoId === playingId || t.id === playingId,
    );
    if (idx >= 0 && idx + 1 < queue.length) return queue[idx + 1];
    if (idx >= 0 && playbackMode.repeatMode === "all") return queue[0];
    return queue[0] || null;
  })();
  const footerPlayerState =
    player.playerState === "idle" && playback?.videoId
      ? playback.isPlaying
        ? "loading"
        : "paused"
      : player.playerState === "loading" && playback?.videoId && !playback.isPlaying
        ? "paused"
        : player.playerState === "idle" && !playback?.videoId
          ? "idle"
          : player.playerState;

  const isLiked = player.nowPlaying?.videoId
    ? likedTrackIds.has(player.nowPlaying.videoId)
    : false;
  const handleToggleLike = useCallback(() => {
    if (player.nowPlaying) toggleLike(player.nowPlaying);
  }, [player.nowPlaying, toggleLike]);

  const handlePlay = useCallback(
    (state: {
      videoId: string;
      seekTo: number;
      serverTime: number;
      id?: string;
      trackName?: string;
      artistName?: string;
      image?: string;
      duration_ms?: number;
    }) => {
      if (!state.videoId) return;
      const elapsed = Math.max(0, (getSyncedTime() - state.serverTime) / 1000);
      const adjustedSeek = state.seekTo > 0 ? state.seekTo + elapsed : 0;

      const track = {
        id: state.id ?? `room-${state.videoId}`,
        source: (state as any).source ?? "youtube",
        videoId: state.videoId,
        name: state.trackName ?? "Playing from room",
        duration_ms: state.duration_ms ?? 0,
        explicit: false,
        artists: [{ name: state.artistName ?? "" }],
        album: { name: "" },
        image: state.image ?? "",
      };

      if (player.nowPlaying?.videoId === state.videoId) {
        player.play?.();
      } else if (!canControlPlayback && listenerMuted) {
        player.playTrack(track, adjustedSeek, true);
        if (!player.isMuted) player.toggleMute();
      } else {
        player.playTrack(track, adjustedSeek, true);
      }
    },
    [getSyncedTime, player.nowPlaying?.videoId, player.play, player.playTrack, canControlPlayback, listenerMuted],
  );

  const handlePause = useCallback(
    (state: { serverTime: number; positionSec: number }) => {
      engineRef.current.seekTo(state.positionSec);
      player.pause?.();
    },
    [player.pause],
  );

  const handleSeek = useCallback(
    (state: { seekTo: number; serverTime: number }) => {
      const elapsed = Math.max(0, (getSyncedTime() - state.serverTime) / 1000);
      engineRef.current.seekTo(state.seekTo + elapsed);
    },
    [getSyncedTime],
  );

  const prevConnected = useRef(connected);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      syncHandledRef.current = false;
    }
    prevConnected.current = connected;
  }, [connected]);

  useEffect(() => {
    if (
      !joined ||
      !playback?.videoId ||
      player.nowPlaying?.videoId === playback.videoId ||
      syncHandledRef.current
    )
      return;

      if (!canControlPlayback && playback.isPlaying) {
      const p = playerRef_fix.current;
      let time = playback.currentTime ?? 0;
      const anchorST = playback.anchorServerTime ?? playback.updatedAt ?? 0;
      if (anchorST) {
        const elapsed = (getSyncedTime() - anchorST) / 1000;
        if (elapsed > 0 && elapsed < 3600) time += elapsed;
      }
      if (!player.isMuted) player.toggleMute();
      p.playTrack(
        {
          id: `room-${playback.videoId}`,
          source: playback.source ?? "youtube",
          videoId: playback.videoId,
          name: playback.trackName,
          duration_ms: 0,
          explicit: false,
          artists: [{ name: playback.artistName }],
          album: { name: "" },
          image: playback.image,
        },
        time,
        false,
      );
      setListenerMuted(true);
    }
  }, [joined, playback, player.nowPlaying?.videoId, canControlPlayback]);

  const maybeAdvanceQueue = useCallback(() => {
    if (!canControlPlaybackRef.current || !joined) return;
    const p = playerRef_fix.current;
    const activeTrack = p.nowPlaying;
    if (!activeTrack) {
      return;
    }

    const currentQueueTrack = queue[0];
    if (!currentQueueTrack) {
      return;
    }

    const activeKey = activeTrack.videoId || activeTrack.id;
    if (!activeKey || queueAdvanceLockRef.current === activeKey) {
      return;
    }
    queueAdvanceLockRef.current = activeKey;

    sendTrackEnded(
      activeTrack.duration_ms ? activeTrack.duration_ms / 1000 : 0,
    );

    const isCurrentQueueTrack =
      currentQueueTrack.videoId === activeTrack.videoId ||
      currentQueueTrack.id === activeTrack.id;

    if (isCurrentQueueTrack) {
      if (playbackMode.repeatMode === "one") {
        p.playTrack(
          {
            id: activeTrack.id,
            source: activeTrack.source ?? "youtube",
            videoId: activeTrack.videoId,
            name: activeTrack.name,
            duration_ms: activeTrack.duration_ms,
            explicit: false,
            artists: activeTrack.artists ?? [{ name: "" }],
            album: activeTrack.album ?? { name: "" },
            image: activeTrack.image ?? "",
          },
          0,
          true,
        );
        sendPlay({
          id: activeTrack.id,
          source: activeTrack.source ?? "youtube",
          videoId: activeTrack.videoId,
          trackName: activeTrack.name,
          artistName: activeTrack.artists?.[0]?.name ?? "",
          image: activeTrack.image ?? "",
          currentTime: 0,
          duration_ms: activeTrack.duration_ms,
        });
        return;
      }

      const upcomingTracks = queue.slice(1);
      const nextTrack =
        upcomingTracks.length > 0
          ? playbackMode.shuffle
            ? upcomingTracks[Math.floor(Math.random() * upcomingTracks.length)]
            : upcomingTracks[0]
          : playbackMode.repeatMode === "all"
            ? currentQueueTrack
            : null;

      if (nextTrack && nextTrack.id !== currentQueueTrack.id) {
        cycleQueueCurrent(currentQueueTrack.id);
      } else if (!nextTrack && queue.length === 1) {
        cycleQueueCurrent(currentQueueTrack.id);
      }

      if (nextTrack) {
        p.playTrack(
          {
            id: nextTrack.id,
            source: nextTrack.source ?? "youtube",
            videoId: nextTrack.videoId,
            name: nextTrack.name,
            duration_ms: nextTrack.duration_ms,
            explicit: false,
            artists: nextTrack.artists ?? [{ name: "" }],
            album: nextTrack.album ?? { name: "" },
            image: nextTrack.image ?? "",
          },
          0,
          true,
        );
        sendPlay({
          id: nextTrack.id,
          source: nextTrack.source ?? "youtube",
          videoId: nextTrack.videoId,
          trackName: nextTrack.name,
          artistName: nextTrack.artists?.[0]?.name ?? "",
          image: nextTrack.image ?? "",
          currentTime: 0,
          duration_ms: nextTrack.duration_ms,
        });
      }
    } else {
      p.playTrack(
        {
          id: currentQueueTrack.id,
          source: currentQueueTrack.source ?? "youtube",
          videoId: currentQueueTrack.videoId,
          name: currentQueueTrack.name,
          duration_ms: currentQueueTrack.duration_ms,
          explicit: false,
          artists: currentQueueTrack.artists ?? [{ name: "" }],
          album: currentQueueTrack.album ?? { name: "" },
          image: currentQueueTrack.image ?? "",
        },
        0,
        true,
      );
      sendPlay({
        id: currentQueueTrack.id,
        source: currentQueueTrack.source ?? "youtube",
        videoId: currentQueueTrack.videoId,
        trackName: currentQueueTrack.name,
        artistName: currentQueueTrack.artists?.[0]?.name ?? "",
        image: currentQueueTrack.image ?? "",
        currentTime: 0,
        duration_ms: currentQueueTrack.duration_ms,
      });
    }
  }, [
    cycleQueueCurrent,
    canControlPlayback,
    joined,
    playbackMode.repeatMode,
    playbackMode.shuffle,
    player.nowPlaying,
    queue,
    sendTrackEnded,
    sendPlay,
    removeFromQueue,
  ]);

  useEffect(() => {
    if (player.playerState === "ended") {
      maybeAdvanceQueue();
    }
  }, [maybeAdvanceQueue, player.playerState]);

  useEffect(() => {
    const activeKey =
      player.nowPlaying?.videoId || player.nowPlaying?.id || null;
    if (!activeKey) {
      queueAdvanceLockRef.current = null;
      return;
    }
    if (
      queueAdvanceLockRef.current === activeKey &&
      ["loading", "playing"].includes(player.playerState) &&
      engineRef.current.currentTime < 2
    ) {
      queueAdvanceLockRef.current = null;
      return;
    }
    if (
      queueAdvanceLockRef.current &&
      queueAdvanceLockRef.current !== activeKey
    )
      queueAdvanceLockRef.current = null;
  }, [
    player.nowPlaying?.id,
    player.nowPlaying?.videoId,
    player.playerState,
    engineRef.current.currentTime,
  ]);

  useEffect(() => {
    if (
      !canControlPlayback ||
      !joined ||
      player.playerState !== "playing" ||
      !player.nowPlaying?.duration_ms
    )
      return;
    const activeTrack = player.nowPlaying;
    const currentQueueTrack = queue[0];
    if (
      !currentQueueTrack ||
      (currentQueueTrack.videoId !== activeTrack.videoId &&
        currentQueueTrack.id !== activeTrack.id)
    )
      return;
    const intervalId = window.setInterval(() => {
      const ct = engineRef.current.currentTime;
      const dur = player.nowPlaying?.duration_ms
        ? player.nowPlaying.duration_ms / 1000
        : 0;
      if (dur > 0 && ct >= Math.max(dur - 2, 0)) {
        maybeAdvanceQueue();
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    canControlPlayback,
    joined,
    maybeAdvanceQueue,
    player.nowPlaying,
    player.playerState,
    queue,
  ]);

  const handleAdminPlayTrack = useCallback(
    (track: Track) => {
      if (!canControlPlayback || !track.videoId) return;
      const oldFirst = queue[0];
      setQueue((prev) => {
        const filtered = prev.filter(
          (t) => t.id !== track.id || t.videoId !== track.videoId,
        );
        return [track, ...filtered];
      });
      if (oldFirst && oldFirst.id !== track.id) cycleQueueCurrent(oldFirst.id);
      player.playTrack(track, 0, true);
      sendPlay({
        id: track.id,
        source: track.source ?? "youtube",
        videoId: track.videoId,
        trackName: track.name,
        artistName: track.artists?.[0]?.name ?? "",
        image: track.image ?? "",
        currentTime: 0,
        duration_ms: track.duration_ms,
      });
    },
    [canControlPlayback, player.playTrack, sendPlay, cycleQueueCurrent, queue],
  );

  const handleSeekAction = useCallback(
    (seekToTime: number) => {
      if (!canControlPlayback || !player.nowPlaying?.videoId) return;
      engineRef.current.seekTo(seekToTime);
      sendSeek(seekToTime);
    },
    [canControlPlayback, player.nowPlaying?.videoId, sendSeek],
  );

  const handlePlayPauseAction = useCallback(() => {
    if (!canControlPlayback) return;
    if (!player.nowPlaying?.videoId) {
      const firstTrack = queue[0];
      if (!firstTrack) return;
      player.playTrack(firstTrack, 0, true);
      sendPlay({
        id: firstTrack.id,
        source: firstTrack.source ?? "youtube",
        videoId: firstTrack.videoId,
        trackName: firstTrack.name,
        artistName: firstTrack.artists?.[0]?.name ?? "",
        image: firstTrack.image ?? "",
        currentTime: 0,
        duration_ms: firstTrack.duration_ms,
      });
      return;
    }
    if (player.playerState === "playing") {
      player.pause?.();
      sendPause(engineRef.current.currentTime);
      return;
    }
    player.play?.();
    sendPlay({
      id: player.nowPlaying.id,
      source: player.nowPlaying.source ?? "youtube",
      videoId: player.nowPlaying.videoId,
      trackName: player.nowPlaying.name,
      artistName: player.nowPlaying.artists?.[0]?.name ?? "",
      image: player.nowPlaying.image ?? "",
      currentTime: engineRef.current.currentTime,
      duration_ms: player.nowPlaying.duration_ms,
    });
  }, [
    canControlPlayback,
    player.nowPlaying,
    player.playerState,
    player.pause,
    player.play,
    engineRef.current.currentTime,
    queue,
    sendPause,
    sendPlay,
    player.playTrack,
  ]);

  const handleListenerPlay = useCallback(() => {
    if (!playback?.isPlaying) return;
    let actualCurrentTime = playback.currentTime ?? 0;
    if (playback.updatedAt) {
      const elapsed = (getSyncedTime() - playback.updatedAt) / 1000;
      if (elapsed > 0 && elapsed < 3600) actualCurrentTime += elapsed;
    }
    if (player.isMuted) player.toggleMute();
    engineRef.current.seekTo(actualCurrentTime);
    setListenerMuted(false);
  }, [playback, getSyncedTime, player]);

  const handleListenerPause = useCallback(() => {
    if (!player.isMuted) player.toggleMute();
    setListenerMuted(true);
  }, [player]);

  const onPlayPauseAction = canControlPlayback
    ? handlePlayPauseAction
    : listenerMuted || player.playerState !== "playing"
      ? handleListenerPlay
      : handleListenerPause;

  const handleSkipForward = useCallback(() => {
    if (!canControlPlayback || !joined) return;
    const playingId = player.nowPlaying?.videoId || player.nowPlaying?.id;
    if (!playingId) return;
    const currentIdx = queue.findIndex(
      (t) => t.videoId === playingId || t.id === playingId,
    );
    if (currentIdx === -1) return;
    const currentTrack = queue[currentIdx];
    if (currentTrack) cycleQueueCurrent(currentTrack.id);
    const upcomingTracks = queue.slice(currentIdx + 1);
    const nextTrack =
      upcomingTracks.length > 0
        ? playbackMode.shuffle
          ? upcomingTracks[Math.floor(Math.random() * upcomingTracks.length)]
          : upcomingTracks[0]
        : playbackMode.repeatMode === "all"
          ? queue[0]
          : null;
    if (!nextTrack) return;
    player.playTrack(nextTrack, 0, true);
    sendPlay({
      id: nextTrack.id,
      source: nextTrack.source ?? "youtube",
      videoId: nextTrack.videoId,
      trackName: nextTrack.name,
      artistName: nextTrack.artists?.[0]?.name ?? "",
      image: nextTrack.image ?? "",
      currentTime: 0,
      duration_ms: nextTrack.duration_ms,
    });
  }, [
    canControlPlayback,
    joined,
    playbackMode.repeatMode,
    playbackMode.shuffle,
    player.nowPlaying,
    queue,
    sendPlay,
    cycleQueueCurrent,
  ]);

  const handleVolumeWrapped = useCallback(
    (val: number) => {
      player.handleVolume(val);
    },
    [player],
  );

  const toggleMuteWrapped = useCallback(() => {
    if (listenerMuted) {
      handleListenerPlay();
    } else {
      player.toggleMute();
    }
  }, [listenerMuted, handleListenerPlay, player]);

  const handleSkipBack = useCallback(() => {
    if (!canControlPlayback || !joined) return;

    const currentTrack = player.nowPlaying;

    if (engineRef.current.currentTime > 3) {
      if (!currentTrack?.videoId) return;
      engineRef.current.seekTo(0);
      sendSeek(0);
      return;
    }

    const currentIdx = queue.findIndex(
      (t) => t.videoId === currentTrack?.videoId || t.id === currentTrack?.id,
    );
    const prevIdx =
      currentIdx > 0
        ? currentIdx - 1
        : playbackMode.repeatMode === "all"
          ? queue.length - 1
          : -1;
    if (prevIdx < 0 || !queue[prevIdx]) {
      if (!currentTrack?.videoId) return;
      engineRef.current.seekTo(0);
      sendSeek(0);
      return;
    }
    const prevTrack = queue[prevIdx];
    player.playTrack(prevTrack, 0, true);
    sendPlay({
      id: prevTrack.id,
      source: prevTrack.source ?? "youtube",
      videoId: prevTrack.videoId,
      trackName: prevTrack.name,
      artistName: prevTrack.artists?.[0]?.name ?? "",
      image: prevTrack.image ?? "",
      currentTime: 0,
      duration_ms: prevTrack.duration_ms,
    });
  }, [
    canControlPlayback,
    joined,
    player.nowPlaying,
    queue,
    playbackMode.repeatMode,
    sendSeek,
    sendPlay,
  ]);

  useEffect(() => {
    player.mediaSessionCbsRef.current = {
      onNext: handleSkipForward,
      onPrev: handleSkipBack,
      onSeekTo: (time: number) => {
        engineRef.current.seekTo(time);
        sendSeek(time);
      },
      onSeekForward: () => {
        engineRef.current.seekTo(engineRef.current.currentTime + 10);
      },
      onSeekBackward: () => {
        engineRef.current.seekTo(engineRef.current.currentTime - 10);
      },
    };
  }, [handleSkipForward, handleSkipBack, sendSeek, engine, engineRef]);

  const handleToggleShuffle = useCallback(() => {
    if (!canControlPlayback) return;
    const newShuffle = !playbackMode.shuffle;
    sendPlaybackMode({ shuffle: newShuffle });
    if (newShuffle) {
      setQueue((prev) => {
        originalQueueRef.current = [...prev];
        const arr = [...prev];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      });
    } else if (originalQueueRef.current.length > 0) {
      setQueue(originalQueueRef.current);
      originalQueueRef.current = [];
    }
  }, [canControlPlayback, playbackMode.shuffle, sendPlaybackMode, setQueue]);

  const handleCycleRepeat = useCallback(() => {
    if (!canControlPlayback) return;
    const nextRepeatMode: RepeatMode =
      playbackMode.repeatMode === "off"
        ? "all"
        : playbackMode.repeatMode === "all"
          ? "one"
          : "off";
    sendPlaybackMode({ repeatMode: nextRepeatMode });
  }, [canControlPlayback, playbackMode.repeatMode, sendPlaybackMode]);

  const handleSkipBackRef = useRef(handleSkipBack);
  useEffect(() => {
    handleSkipBackRef.current = handleSkipBack;
  }, [handleSkipBack]);
  const handleSkipForwardRef = useRef(handleSkipForward);
  useEffect(() => {
    handleSkipForwardRef.current = handleSkipForward;
  }, [handleSkipForward]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        handleSkipBackRef.current(),
      );
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        handleSkipForwardRef.current(),
      );
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        const newTime = Math.max(0, engineRef.current.currentTime - 10);
        engineRef.current.seekTo(newTime);
        if (canControlPlaybackRef.current) sendSeek(newTime);
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        const newTime = Math.min(
          engineRef.current.duration,
          engineRef.current.currentTime + 10,
        );
        engineRef.current.seekTo(newTime);
        if (canControlPlaybackRef.current) sendSeek(newTime);
      });
      navigator.mediaSession.setActionHandler("play", () => {
        const p = playerRef_fix.current;
        if (p.playerState === "playing") return;
        if (!canControlPlaybackRef.current) return;
        p.play?.();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        const p = playerRef_fix.current;
        if (p.playerState !== "playing") return;
        if (!canControlPlaybackRef.current) return;
        p.pause?.();
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) {
          engineRef.current.seekTo(details.seekTime);
          if (canControlPlaybackRef.current) sendSeek(details.seekTime);
        }
      });
    } catch {}
  }, [sendSeek]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const interval = setInterval(() => {
      const dur = player.nowPlaying?.duration_ms
        ? player.nowPlaying.duration_ms / 1000
        : 0;
      if (dur <= 0) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: engineRef.current.currentTime,
        });
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [player.nowPlaying?.videoId, player.nowPlaying?.duration_ms]);

  useEffect(() => {
    return () => {
      syncHandledRef.current = false;
    };
  }, []);

  const isRejoinRef = useRef(false);

  useEffect(() => {
    if (authLoading || !user || !code) return;
    const lastRoom = localStorage.getItem("blu3_last_room");
    const isRejoin = lastRoom === code;
    isRejoinRef.current = isRejoin;
    if (room?.code === code) {
      setJoined(true);
      localStorage.setItem("blu3_last_room", code);
      return;
    }
    joinRoom(code).then((result) => {
      if (result?.room) {
        setJoined(true);
        localStorage.setItem("blu3_last_room", code);
      } else if (result?.error) {
        setJoinErrorMessage(result.error);
        setTimeout(() => router.replace("/browse"), 3000);
      } else {
        router.replace("/browse");
      }
    });
  }, [authLoading, user, code]);

  useEffect(() => {
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onVisibilityChange((visible) => {
      if (visible) {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => requestSync(), 300);
      }
    });
    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      unsub();
    };
  }, [requestSync]);

  useEffect(() => {
    if (!joined || !canControlPlayback || !player.nowPlaying?.videoId) return;
    const heartbeatId = window.setInterval(() => {
      if (player.playerState === "playing")
        sendProgress(engineRef.current.currentTime);
    }, 1000);
    return () => window.clearInterval(heartbeatId);
  }, [
    canControlPlayback,
    joined,
    player.nowPlaying?.videoId,
    player.playerState,
    engineRef.current.currentTime,
    sendProgress,
  ]);

  const openSearchOverlay = useCallback(() => {
    setChatOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearchOverlay = useCallback(() => {
    suggestState.hideSuggestions();
    setSearchOpen(false);
  }, [suggestState.hideSuggestions]);
  const openChatOverlay = useCallback(() => {
    setSearchOpen(false);
    setChatOpen(true);
  }, []);
  const closeChatOverlay = useCallback(() => {
    setChatOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearchOverlay();
      }
      if (event.key === "Escape") {
        closeSearchOverlay();
        closeChatOverlay();
      }
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault();
        onPlayPauseAction?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeChatOverlay,
    closeSearchOverlay,
    openSearchOverlay,
    onPlayPauseAction,
  ]);

  const handleLeave = () => {
    leaveRoom();
    router.replace("/browse");
  };
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput("");
  };
  const handleSendGif = useCallback((gifUrl: string) => {
    sendChat(gifUrl);
  }, [sendChat]);
  const handleSearchInputChange = useCallback(
    (value: string) => {
      searchState.onSearchInput(value);
      suggestState.onSuggestInput(value);
    },
    [searchState.onSearchInput, suggestState.onSuggestInput],
  );
  const runSearchOverlay = useCallback(
    (query: string) => {
      openSearchOverlay();
      suggestState.hideSuggestions();
      const trimmed = query.trim();
      if (!trimmed) {
        searchState.setResults([]);
        return;
      }
      searchState.doSearch(trimmed);
    },
    [
      openSearchOverlay,
      searchState.doSearch,
      searchState.setResults,
      suggestState.hideSuggestions,
    ],
  );
  const showQueuePanel = useCallback(() => {
    setSearchOpen(false);
    setChatOpen(false);
  }, []);
  const handleSearchTrackSelect = useCallback(
    (track: Track) => {
      handleAdminPlayTrack(track);
      closeSearchOverlay();
    },
    [closeSearchOverlay, handleAdminPlayTrack],
  );

  const handleResolveLink = useCallback(
    (url: string) => resolveLink(url, token),
    [token],
  );

  const popularGenres = [
    "Pop hits",
    "Hip hop",
    "Lo-fi",
    "Rock classics",
    "Bollywood",
    "EDM",
  ];

  return (
    <>
      <div className="relative min-h-dvh safe-area-top safe-area-bottom">
        <div
          className={`absolute inset-0 z-50 transition-opacity duration-500 ${
            authLoading || !joined || !initialDataLoaded
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
        >
          <RoomLoading />
        </div>
        <div
          className={`transition-opacity duration-500 ${
            authLoading || !joined || !initialDataLoaded
              ? "opacity-0 pointer-events-none"
              : "opacity-100 pointer-events-auto"
          }`}
        >
          <div className="w-full h-full bg-black relative">
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
              <RoomBackground
                isPlaying={player.playerState === "playing"}
                trackImage={footerTrack?.image}
              />
            </div>

            <div className="relative z-10 gap-2 sm:h-dvh items-center justify-center flex flex-col h-full w-full overflow-hidden">
              <div
                className="mx-auto flex sm:border border-white/10 h-full sm:h-[82%] flex-col pb-0  px-0 sm:rounded-3xl
              w-[55%] max-2xl:w-[62%] max-xl:w-[clamp(1rem,120vh,500rem)] max-lg:w-[92%] max-sm:w-full
              filter shadow-[0_0_40px_rgba(0,0,0,0.6)]
              sm:filter sm:shadow-[0_0_60px_rgba(0,0,0,0.5)] "
              >
                <div className="flex h-full mt-0  gap-0 sm:gap-2 pt-0  min-h-0">
                  <div className="relative w-full h-full flex flex-col sm:flex-row min-h-0 flex-1 gap-0 sm:gap-3 pb-0  lg:pb-0">
                    <aside
                      className="
                  w-full sm:w-[55%] h-full lg:h-full shrink-0 min-h-125 sm:min-h-0 lg:min-h-0
                  max-sm:rounded-none sm:rounded-3xl
                  max-sm:border-0 sm:border sm:border-white/10
                  bg-white/5
                   backdrop-blur-2xl

                  filter drop-shadow-[0_0_40px_rgba(0,0,0,1)]
                  sm:filter sm:drop-shadow-[0_0_60px_rgba(0,0,0,1)]

                  overflow-visible

                  relative transition-all duration-300
                  max-sm:before:hidden sm:before:absolute sm:before:inset-0 sm:before:rounded-3xl sm:before:pointer-events-none sm:before:bg-linear-to-b sm:before:from-white/4 sm:before:to-transparent
                "
                    >
                      <SquarePlayer
                        track={footerTrack}
                        activeVideoId={
                          player.activeVideoId ?? playback?.videoId ?? null
                        }
                        playerState={footerPlayerState}
                        isLiked={isLiked}
                        onToggleLike={handleToggleLike}
                        progress={engine.progress}
                        currentTime={engine.currentTime}
                        duration={engine.duration}
                        volume={player.volume}
                        isMuted={player.isMuted}
                        onPlayPause={onPlayPauseAction}
                        onMute={toggleMuteWrapped}
                        onVolume={handleVolumeWrapped}
                        onSeek={
                          canControlPlayback ? handleSeekAction : undefined
                        }
                        onSkipBack={
                          canControlPlayback ? handleSkipBack : undefined
                        }
                        onSkipForward={
                          canControlPlayback ? handleSkipForward : undefined
                        }
                        forcePlayIcon={listenerMuted && !canControlPlayback}
                      />
                    </aside>

                    <aside
                      className="
                  flex-1 min-w-0 w-full sm:w-[45%] h-full lg:h-full shrink-0 min-h-95 sm:min-h-0 lg:min-h-0
                  max-sm:rounded-none sm:rounded-3xl
                  max-sm:border-0 sm:border-2 sm:border-white/8
                  bg-white/5
                  backdrop-blur-2xl

                  filter drop-shadow-[0_0_40px_rgba(0,0,0,1)]
                  sm:filter sm:drop-shadow-[0_0_60px_rgba(0,0,0,0.6)]

                  overflow-hidden

                  transition-all duration-300
                  max-sm:before:hidden sm:before:absolute sm:before:inset-0 sm:before:rounded-3xl sm:before:pointer-events-none sm:before:bg-gradient-to-b sm:before:from-white/[0.04] sm:before:to-transparent
                  flex flex-col
                "
                    >
                      <RightSidebar
                        members={members}
                        messages={messages}
                        queue={queue}
                        recentTracks={recentTracks}
                        canControlPlayback={canControlPlayback}
                        handleAdminPlayTrack={handleAdminPlayTrack}
                        removeFromQueue={removeFromQueue}
                        addToQueue={addToQueue}
                        activeVideoId={
                          player.activeVideoId ?? playback?.videoId ?? null
                        }
                        roomTheme={roomTheme}
                        onThemeChange={setRoomTheme}
                        playerState={footerPlayerState}
                        shuffleEnabled={playbackMode.shuffle}
                        repeatMode={playbackMode.repeatMode}
                        onToggleShuffle={
                          canControlPlayback ? handleToggleShuffle : undefined
                        }
                        onCycleRepeat={
                          canControlPlayback ? handleCycleRepeat : undefined
                        }
                        onChatToggle={() => setChatOpen(!chatOpen)}
                        chatOpen={chatOpen}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        handleSendChat={handleSendChat}
                        sendGif={handleSendGif}
                        nextTrack={nextTrack}
                        onSearchClick={openSearchOverlay}
                        clearQueue={clearQueue}
                        user={user}
                        onLogout={() => {
                          logout();
                          router.push("/");
                        }}
                        onLeave={handleLeave}
                        roomCode={code}
                        resolveLink={handleResolveLink}
                      />
                    </aside>
                  </div>
                </div>
              </div>
              {/*<RoomFooter />*/}
            </div>

            {queueToast && <QueueToast data={queueToast} />}
            {joinErrorMessage && <RoomErrorModal message={joinErrorMessage} />}

            <SearchOverlay
              isOpen={searchOpen}
              onClose={closeSearchOverlay}
              searchQuery={searchState.searchQuery}
              suggestions={suggestState.suggestions}
              showSuggestions={suggestState.showSuggestions}
              results={searchState.results}
              isSearching={searchState.isSearching}
              searchError={searchState.searchError ?? ""}
              recentTracks={
                recentTracks.map(asTrackFromRecent).filter(Boolean) as Track[]
              }
              activeTrackId={player.nowPlaying?.id ?? null}
              loadingTrackId={null}
              isPlaying={player.playerState === "playing"}
              onSearchInput={(val) => {
                searchState.onSearchInput(val);
                suggestState.onSuggestInput(val);
              }}
              onSearch={(q) => {
                suggestState.hideSuggestions();
                if (q.trim()) searchState.doSearch(q.trim());
                else searchState.setResults([]);
              }}
              onSuggestionSelect={(s) => {
                suggestState.hideSuggestions();
                searchState.onSearchInput(s);
                searchState.doSearch(s);
              }}
              onTrackSelect={handleSearchTrackSelect}
              onAddToQueue={(track) => {
                addToQueue(track);
              }}
              avatarUrl={user?.avatar ?? undefined}
              avatarLabel={user?.name || user?.email || "U"}
              popularGenres={popularGenres}
            />
          </div>
        </div>
      </div>
    </>
  );
}
