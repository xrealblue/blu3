"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { Track } from "@/utils/types";
import { usePlaylists } from "@/hooks/usePlaylists";
import { Icon } from "@/hooks/useIcon";
import { Trash2, Plus } from "lucide-react";
import { PlaylistModal } from "./PlaylistModal";
import { ImportToast, type ImportStatus } from "./ImportToast";
import { EmptyQueue } from "./EmptyQueue";
import { QueueManageBar } from "./QueueManageBar";
import { QueueMenu } from "./QueueMenu";
import { QueueTrackItem } from "./QueueTrackItem";
import { HistoryTrackItem } from "./HistoryTrackItem";

interface Props {
  queue: Track[];
  recentTracks: Array<{
    videoId: string;
    trackName: string;
    artistName: string;
    image: string;
    playedAt: number;
  }>;
  canControlPlayback: boolean;
  handleAdminPlayTrack: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  addToQueue: (track: Track) => void;
  clearQueue?: () => void;
  activeVideoId: string | null | undefined;
  playerState?: string;
  shuffleEnabled?: boolean;
  repeatMode?: "off" | "all" | "one";
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
  onSearchClick?: () => void;
  userName?: string;
  resolveLink: (url: string) => Promise<{
    videoId: string;
    name: string;
    artist: string;
    image: string;
    source: string;
  } | null>;
}

export function QueueAndHistory({
  queue,
  recentTracks,
  canControlPlayback,
  handleAdminPlayTrack,
  removeFromQueue,
  addToQueue,
  activeVideoId,
  playerState,
  shuffleEnabled = false,
  repeatMode = "off",
  onToggleShuffle,
  resolveLink,
  onCycleRepeat,
  onSearchClick,
  clearQueue,
  userName,
}: Props) {
  const { likedTrackIds, toggleLike } = usePlaylists();

  const showRecent = useMemo(() => {
    if (queue.length > 0 || recentTracks.length === 0) return false;
    const newestPlayedAt = Math.max(...recentTracks.map((t) => t.playedAt));
    return Date.now() - newestPlayedAt > 1800000;
  }, [queue.length, recentTracks]);

  const recentToShow = useMemo(() => {
    if (!showRecent) return [];
    const filtered = recentTracks.filter((t) => t.videoId !== activeVideoId);
    return filtered.slice(0, 10);
  }, [showRecent, recentTracks, activeVideoId]);

  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    type: "idle",
  });

  const handleQueuePlaylist = async (playlistId: string) => {
    const token = localStorage.getItem("blu3_token");
    if (!token) return;
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        [...data.tracks].reverse().forEach((t: any) => {
          const source = t.source || (/^\d+$/.test(t.videoId) ? "jiosaavn" : "youtube");
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
    } catch (err) {
    }
  };

  const handlePlayTrack = (track: Track) => {
    if (manageMode) return;
    if (!canControlPlayback) return;
    handleAdminPlayTrack(track);
  };

  const handlePlayHistory = (historyTrack: Track) => {
    if (!canControlPlayback) return;
    handleAdminPlayTrack(historyTrack);
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = () => {
    selectedIds.forEach((id) => removeFromQueue(id));
    setSelectedIds(new Set());
    setManageMode(false);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === queue.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.map((t) => t.id)));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 py-1 ">
      <div className="flex items-center gap-2 px-2">
        <span className="text-lg text-white">
          Queue {"("}
          {queue.length}
          {")"}
        </span>

        <div className="ml-auto relative flex gap-1 items-center">
          <button
            onClick={() => onSearchClick?.()}
            className="flex h-9 w-fit px-5 gap-1 text-sm items-center justify-center rounded-lg bg-white/30 backdrop-blur-md text-white hover:bg-white/40 font-normal cursor-pointer transition-all"
            title="Search songs"
          >
            <Icon name="search" size={20} className="-ml-1 text-current" />{" "}
            {"Search"}
          </button>

          <button
            onClick={() => setShowPlaylistModal(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/30 backdrop-blur-md text-white hover:bg-white/40 cursor-pointer transition-all"
            title="Add playlist to queue"
          >
            <Plus size={20} />
          </button>

          {canControlPlayback && (
            <button
              onClick={() => {
                setManageMode(!manageMode);
                if (manageMode) setSelectedIds(new Set());
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg backdrop-blur-md text-white cursor-pointer transition-all ${
                manageMode
                  ? "bg-[#C0392B]/80 text-white"
                  : "bg-white/30 hover:bg-white/40"
              }`}
              title={
                manageMode ? "Exit selection mode" : "Select tracks to remove"
              }
            >
              <Trash2
                size={20}
                className={manageMode ? "text-white" : "text-current"}
              />
            </button>
          )}

          {/*<QueueMenu
            showMenu={showMenu}
            shuffleEnabled={shuffleEnabled}
            repeatMode={repeatMode}
            onToggleShuffle={onToggleShuffle}
            onCycleRepeat={onCycleRepeat}
            onToggle={() => setShowMenu(!showMenu)}
            onClose={() => setShowMenu(false)}
            menuRef={menuRef}
          />*/}
        </div>
      </div>

      {manageMode && queue.length > 0 && (
        <QueueManageBar
          queue={queue}
          selectedIds={selectedIds}
          onDeleteSelected={handleDeleteSelected}
          onSelectAll={handleSelectAll}
        />
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        {queue.length > 0 ? (
          <>
            <div className="flex-1 space-y-1 pr-1 overflow-y-auto">
              {[...queue]
                .sort((a) => (a.videoId === activeVideoId ? -1 : 0))
                .map((track, i) => {
                  const isActive = activeVideoId
                    ? activeVideoId === track.videoId
                    : i === 0;

                  return (
                    <QueueTrackItem
                      key={`${track.id}-${i}`}
                      track={track}
                      index={i}
                      isActive={isActive}
                      playerState={playerState}
                      canControlPlayback={canControlPlayback}
                      manageMode={manageMode}
                      selectedIds={selectedIds}
                      likedTrackIds={likedTrackIds}
                      onPlay={() => handlePlayTrack(track)}
                      onToggleSelect={handleToggleSelect}
                      onToggleLike={toggleLike}
                    />
                  );
                })}
            </div>
          </>
        ) : showRecent && recentToShow.length > 0 ? (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="px-2.5 pb-2 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Previously played
            </div>
            <div className="flex-1 space-y-1 pr-1 overflow-y-auto">
              {recentToShow.map((track, i) => {
                const historyTrack: Track = {
                  id: track.videoId,
                  source: (track as any).source ?? "youtube",
                  videoId: track.videoId,
                  name: track.trackName,
                  artists: [{ name: track.artistName }],
                  album: { name: "" },
                  image: track.image,
                  duration_ms: 0,
                  explicit: false,
                };
                const isActive = activeVideoId === track.videoId;

                return (
                  <HistoryTrackItem
                    key={`${track.videoId}-${i}`}
                    track={track}
                    historyTrack={historyTrack}
                    isActive={isActive}
                    playerState={playerState}
                    canControlPlayback={canControlPlayback}
                    manageMode={manageMode}
                    likedTrackIds={likedTrackIds}
                    onPlay={() => handlePlayHistory(historyTrack)}
                    onToggleLike={toggleLike}
                    onAddToQueue={addToQueue}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyQueue userName={userName} onSearchClick={onSearchClick} />
        )}
      </section>

      <PlaylistModal
        open={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        onQueuePlaylist={handleQueuePlaylist}
        onImportStatus={setImportStatus}
        resolveLink={resolveLink}
        addToQueue={addToQueue}
      />
      <ImportToast
        status={importStatus}
        onDismiss={() => setImportStatus({ type: "idle" })}
      />
    </div>
  );
}
