"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { RecentTrack, Track } from "@/utils/types";

const WS_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") ||
  "ws://localhost:8000";

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  text: string;
  ts: number;
}

export interface Member {
  userId: string;
  name: string;
  avatar?: string;
}

export interface PlaybackState {
  videoId: string | null;
  source?: string;
  trackName: string;
  artistName: string;
  image: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  anchorServerTime?: number;
  positionSec?: number;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackMode {
  shuffle: boolean;
  repeatMode: RepeatMode;
}

interface PlayMessage {
  videoId: string;
  source?: string;
  seekTo: number;
  serverTime: number;
  anchorServerTime: number;
  id?: string;
  trackName?: string;
  artistName?: string;
  image?: string;
  duration_ms?: number;
  recentTracks?: RecentTrack[];
}

interface SeekMessage {
  seekTo: number;
  serverTime: number;
  anchorServerTime: number;
}

type RoomSocketMessage =
  | { type: "clock_sync"; serverTime: number }
  | {
      type: "play";
      videoId: string;
      source?: string;
      seekTo: number;
      serverTime: number;
      anchorServerTime: number;
      id?: string;
      trackName?: string;
      artistName?: string;
      image?: string;
      duration_ms?: number;
      recentTracks?: RecentTrack[];
    }
  | { type: "pause"; serverTime: number; anchorServerTime: number; positionSec: number }
  | { type: "seek"; seekTo: number; serverTime: number; anchorServerTime: number }
  | {
      type: "room:joined";
      isHost: boolean;
      isHostActive?: boolean;
      members?: Member[];
      playback?: PlaybackState | null;
      playbackMode?: PlaybackMode;
      recentTracks?: RecentTrack[];
      queue?: Track[];
    }
  | { type: "host:active_changed"; isHostActive: boolean }
  | {
      type: "room:member_joined";
      members?: Member[];
      user?: { userId: string; name: string; avatar?: string };
    }
  | { type: "room:member_left"; members?: Member[]; userId?: string }
  | { type: "chat:message"; message: ChatMessage }
  | {
      type: "playback:sync";
      videoId: string | null;
      source?: string;
      trackName: string;
      artistName: string;
      image: string;
      isPlaying: boolean;
      currentTime: number;
      updatedAt: number;
      playbackMode?: PlaybackMode;
      recentTracks?: RecentTrack[];
      queue?: Track[];
    }
  | { type: "room:playback_mode"; playbackMode: PlaybackMode }
  | { type: "room:queue_update"; queue?: Track[]; recentTracks?: RecentTrack[] }
  | { type: "track:preresolved"; videoId: string; audioUrl: string };

interface UseRoomSocketProps {
  roomCode: string | null;
  onPlay?: (state: PlayMessage) => void;
  onPause?: (state: { serverTime: number; positionSec: number }) => void;
  onSeek?: (state: SeekMessage) => void;
  onPlaybackSync?: (state: PlaybackState, getSyncedTime: () => number) => void;
  onMemberJoined?: (user: { name: string; avatar?: string }) => void;
  onPreResolved?: (videoId: string, audioUrl: string) => void;
  chatOpen?: boolean;
}

export function useRoomSocket({
  roomCode,
  onPlay,
  onPause,
  onSeek,
  onPlaybackSync,
  onMemberJoined,
  onPreResolved,
  chatOpen,
}: UseRoomSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const clockOffsetRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [isHostActive, setIsHostActive] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>({
    shuffle: false,
    repeatMode: "off",
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);
  const onPlaybackSyncRef = useRef(onPlaybackSync);
  const onMemberJoinedRef = useRef(onMemberJoined);
  const onPreResolvedRef = useRef(onPreResolved);
  const chatOpenRef = useRef(chatOpen);

  const getSyncedTime = useCallback(
    () => Date.now() + clockOffsetRef.current,
    [],
  );

  const getSyncedPosition = useCallback(
    (positionSec: number, anchorServerTime: number, isPlaying: boolean): number => {
      if (!isPlaying) return positionSec;
      const serverNow = Date.now() + clockOffsetRef.current;
      const elapsed = (serverNow - anchorServerTime) / 1000;
      return Math.max(0, positionSec + elapsed);
    },
    [],
  );

  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onSeekRef.current = onSeek;
    onPlaybackSyncRef.current = onPlaybackSync;
    onMemberJoinedRef.current = onMemberJoined;
    onPreResolvedRef.current = onPreResolved;
  }, [onPause, onPlay, onSeek, onPlaybackSync, onMemberJoined, onPreResolved]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  const pendingMessagesRef = useRef<string[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;

  const safeSend = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data);
    } else {
      pendingMessagesRef.current.push(data);
    }
  }, []);

  const connectWs = useCallback(() => {
    const code = roomCodeRef.current;
    if (!code) return;
    const token = localStorage.getItem("blu3_token");
    if (!token) return;

    const wsUrl = `${WS_URL}/ws?token=${encodeURIComponent(token)}&room=${code}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;
      const pending = pendingMessagesRef.current;
      pendingMessagesRef.current = [];
      for (const msg of pending) {
        ws.send(msg);
      }
    };
    ws.onclose = () => {
      setConnected(false);
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(connectWs, delay);
    };
    ws.onerror = (e) => {
    };
    ws.onmessage = (event) => {
      let msg: RoomSocketMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "clock_sync": {
          const offset = msg.serverTime - Date.now();
          clockOffsetRef.current = offset;
          setClockOffsetMs(offset);
          break;
        }
        case "room:joined":
          setIsHost(msg.isHost);
          setIsHostActive(msg.isHostActive ?? true);
          setMembers(msg.members ?? []);
          if (msg.playback) {
            const pb = msg.playback;
            setPlayback({ ...pb, anchorServerTime: pb.anchorServerTime ?? pb.updatedAt, positionSec: pb.currentTime });
          } else {
            setPlayback(null);
          }
          if (msg.playbackMode) setPlaybackModeState(msg.playbackMode);
          if (msg.recentTracks) setRecentTracks(msg.recentTracks);
          if (msg.queue) setQueue(msg.queue);
          setInitialDataLoaded(true);
          if (msg.playback?.videoId) {
            window.setTimeout(() => {
              safeSend(JSON.stringify({ type: "playback:sync_request" }));
            }, 0);
          }
          break;
        case "host:active_changed":
          setIsHostActive(msg.isHostActive);
          break;
        case "room:member_joined":
          setMembers(msg.members ?? []);
          if (msg.user) onMemberJoinedRef.current?.(msg.user);
          break;
        case "room:member_left":
          setMembers(msg.members ?? []);
          break;
        case "chat:message":
          setMessages((prev) => [...prev.slice(-199), msg.message]);
          if (!chatOpenRef.current) setUnreadChatCount((c) => c + 1);
          break;
        case "play":
          setPlayback({
            videoId: msg.videoId ?? null,
            source: msg.source ?? "youtube",
            trackName: msg.trackName ?? "",
            artistName: msg.artistName ?? "",
            image: msg.image ?? "",
            isPlaying: true,
            currentTime: msg.seekTo ?? 0,
            updatedAt: msg.serverTime,
            anchorServerTime: msg.anchorServerTime,
            positionSec: msg.seekTo ?? 0,
          });
          if (msg.recentTracks) setRecentTracks(msg.recentTracks);
          onPlayRef.current?.(msg);
          break;
        case "pause":
          setPlayback((prev) =>
            prev
              ? { ...prev, isPlaying: false, updatedAt: msg.serverTime, anchorServerTime: msg.anchorServerTime, positionSec: msg.positionSec, currentTime: msg.positionSec }
              : prev,
          );
          onPauseRef.current?.(msg);
          break;
        case "seek":
          setPlayback((prev) =>
            prev
              ? {
                  ...prev,
                  currentTime: msg.seekTo ?? prev.currentTime,
                  updatedAt: msg.serverTime,
                  anchorServerTime: msg.anchorServerTime,
                  positionSec: msg.seekTo ?? prev.positionSec,
                }
              : prev,
          );
          onSeekRef.current?.(msg);
          break;
        case "playback:sync":
          setPlayback({
            videoId: msg.videoId ?? null,
            source: (msg as any).source ?? "youtube",
            trackName: msg.trackName ?? "",
            artistName: msg.artistName ?? "",
            image: msg.image ?? "",
            isPlaying: Boolean(msg.isPlaying),
            currentTime: msg.currentTime ?? 0,
            updatedAt: msg.updatedAt ?? Date.now(),
            anchorServerTime: (msg as any).anchorServerTime ?? msg.updatedAt ?? Date.now(),
            positionSec: msg.currentTime ?? 0,
          });
          if (msg.playbackMode) setPlaybackModeState(msg.playbackMode);
          if (msg.recentTracks) setRecentTracks(msg.recentTracks);
          if (msg.queue) setQueue(msg.queue);
          onPlaybackSyncRef.current?.(msg, getSyncedTime);
          break;
        case "room:playback_mode":
          setPlaybackModeState(msg.playbackMode);
          break;
        case "room:queue_update":
          if (msg.queue) setQueue(msg.queue);
          if (msg.recentTracks) setRecentTracks(msg.recentTracks);
          break;
        case "track:preresolved":
          onPreResolvedRef.current?.(msg.videoId, msg.audioUrl);
          break;
      }
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs, roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => {
      safeSend(JSON.stringify({ type: "clock_sync_request" }));
    }, 300000);
    return () => clearInterval(interval);
  }, [roomCode, safeSend]);

  const sendChat = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      safeSend(JSON.stringify({ type: "chat:send", text }));
    },
    [safeSend],
  );

  const sendPlay = useCallback(
    (track: {
      id?: string;
      source?: string;
      videoId: string;
      trackName: string;
      artistName: string;
      image: string;
      currentTime?: number;
      duration_ms?: number;
    }) => {
      const msg = JSON.stringify({ type: "playback:play", ...track });
      safeSend(msg);
    },
    [safeSend],
  );

  const sendPause = useCallback(
    (currentTime: number) => {
      safeSend(JSON.stringify({ type: "playback:pause", currentTime }));
    },
    [safeSend],
  );

  const sendSeek = useCallback(
    (currentTime: number) => {
      safeSend(JSON.stringify({ type: "playback:seek", currentTime }));
    },
    [safeSend],
  );

  const requestSync = useCallback(() => {
    safeSend(JSON.stringify({ type: "playback:sync_request" }));
  }, [safeSend]);

  const sendPlaybackMode = useCallback(
    (mode: Partial<PlaybackMode>) => {
      safeSend(JSON.stringify({ type: "playback:mode", ...mode }));
    },
    [safeSend],
  );

  const sendProgress = useCallback(
    (currentTime: number) => {
      safeSend(JSON.stringify({ type: "progress", currentTime }));
    },
    [safeSend],
  );

  const sendTrackEnded = useCallback(
    (currentTime: number) => {
      safeSend(JSON.stringify({ type: "playback:ended", currentTime }));
    },
    [safeSend],
  );

  const addToQueue = useCallback(
    (track: Track) => {
      safeSend(JSON.stringify({ type: "queue:add", track }));
    },
    [safeSend],
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      safeSend(JSON.stringify({ type: "queue:remove", trackId }));
    },
    [safeSend],
  );

  const cycleQueueCurrent = useCallback(
    (trackId: string) => {
      safeSend(JSON.stringify({ type: "queue:cycle_current", trackId }));
    },
    [safeSend],
  );

  const clearQueue = useCallback(() => {
    safeSend(JSON.stringify({ type: "queue:clear" }));
  }, [safeSend]);

  return {
    connected,
    initialDataLoaded,
    clockOffsetMs,
    isHost,
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
    requestSync,
    sendPlaybackMode,
    sendProgress,
    sendTrackEnded,
    getSyncedTime,
    getSyncedPosition,
    addToQueue,
    removeFromQueue,
    cycleQueueCurrent,
    clearQueue,
    unreadChatCount,
    resetUnreadChat: useCallback(() => setUnreadChatCount(0), []),
  };
}
