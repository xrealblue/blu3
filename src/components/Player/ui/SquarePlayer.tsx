"use client";
import { useEffect, useRef, useState } from "react";
import { Track } from "@/utils/types";
import { fmtSec } from "@/utils/formatters";
import Image from "next/image";
import { Icon } from "@/hooks/useIcon";
import { Slider } from "@/components/ui/slider";
import { Profile } from "@/components/Profile";
import { GitBranchIcon, XLogoIcon, DownloadSimpleIcon } from "@phosphor-icons/react";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

interface TrackPersonality {
  baseEnergy: number;
  tempoFactor: number;
  bassWeight: number;
  dynamicRange: number;
}

function getPersonality(seed: number): TrackPersonality {
  return {
    baseEnergy: 0.3 + (((seed >> 0) & 0xff) / 255) * 0.7,
    tempoFactor: 0.6 + (((seed >> 8) & 0xff) / 255) * 1.4,
    bassWeight: 0.2 + (((seed >> 16) & 0xff) / 255) * 0.8,
    dynamicRange: 0.2 + (((seed >> 24) & 0xff) / 255) * 0.8,
  };
}

const NUM_LINES = 5;
const GAP = 28;
const SPEED = 0.45;

const WAVE_LINES = [
  {
    amp: 0.025,
    wlSpeed: 0.04,
    wlPhase: 0.0,
    scrollSpeed: 0.3,
    scrollPhase: 0.0,
  },
  {
    amp: 0.06,
    wlSpeed: 0.1,
    wlPhase: 1.3,
    scrollSpeed: 0.8,
    scrollPhase: 0.8,
  },
  {
    amp: 0.08,
    wlSpeed: 0.18,
    wlPhase: 2.6,
    scrollSpeed: 0.5,
    scrollPhase: 1.6,
  },
  {
    amp: 0.045,
    wlSpeed: 0.06,
    wlPhase: 3.9,
    scrollSpeed: 1.0,
    scrollPhase: 2.4,
  },
  {
    amp: 0.035,
    wlSpeed: 0.15,
    wlPhase: 5.2,
    scrollSpeed: 0.4,
    scrollPhase: 3.2,
  },
];

function ease(x: number) {
  return x < 0.5 ? 4 * x * x * x : (x - 1) * (2 * x - 2) * (2 * x - 2) + 1;
}

interface Props {
  track: Track | null;
  activeVideoId: string | null;
  playerState: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  onPlayPause?: () => void;
  onMute: () => void;
  onVolume: (val: number) => void;
  onSeek?: (time: number) => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  hideWaves?: boolean;
  forcePlayIcon?: boolean;
}

export function SquarePlayer({
  track,
  activeVideoId,
  playerState,
  progress,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onMute,
  onVolume,
  onSeek,
  onSkipBack,
  onSkipForward,
  isLiked = false,
  onToggleLike,
  hideWaves = false,
  forcePlayIcon = false,
}: Props) {
  const isPlaying = playerState === "playing";
  const isLoading = playerState === "loading";
  const title =
    track?.name ?? (activeVideoId ? "Playing from URL" : "Nothing playing yet");
  const displayTitle = title.length > 30 ? title.slice(0, 30) + "..." : title;
  const artist = track?.artists?.map((a) => a.name).join(", ") ?? "";
  const albumName = track?.album?.name ?? "";
  const subtitle = [artist, albumName].filter(Boolean).join(" · ");
  const albumArt =
    track?.image ||
    (activeVideoId
      ? `https://i.ytimg.com/vi/${activeVideoId}/maxresdefault.jpg`
      : `/queue/sunflower.jpg`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  const morphTRef = useRef(1);
  const lastTsRef = useRef<number | null>(null);
  const scrollOffsetRef = useRef(0);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!track?.videoId || downloading) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("blu3_token") : null;
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    setDownloading(true);
    try {
      const res = await fetch(`${apiUrl}/api/audio/${track.videoId}?token=${token}`);
      if (!res.ok) throw new Error("Failed to fetch audio");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${track.name ?? "track"} - ${track.artists?.map((a) => a.name).join(", ") ?? "blu3"}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Download] failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (hideWaves) return;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const artWrap = wrapRef.current;
    if (!canvas || !frame || !artWrap) return;

    const syncSize = () => {
      const fRect = frame.getBoundingClientRect();
      const w = Math.floor(fRect.width);
      const h = Math.floor(fRect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w || 1;
        canvas.height = h || 1;
      }
    };

    const loop = (ts: number) => {
      syncSize();
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const W = canvas.width;
      const H = canvas.height;

      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
      lastTsRef.current = ts;

      if (isPlaying)
        morphTRef.current = Math.min(morphTRef.current + dt * SPEED * 0.9, 1);
      else
        morphTRef.current = Math.max(morphTRef.current - dt * SPEED * 1.4, 0);

      if (isPlaying) {
        tRef.current += dt * SPEED;
        const seed = track?.id
          ? hashStr(track.id)
          : track?.videoId
            ? hashStr(track.videoId)
            : 0;
        const p = getPersonality(seed);
        scrollOffsetRef.current += dt * p.tempoFactor;
      }

      const mt = ease(morphTRef.current);
      ctx.clearRect(0, 0, W, H);

      const aRect = artWrap.getBoundingClientRect();
      const fRect = frame.getBoundingClientRect();
      const midY = aRect.top - fRect.top + aRect.height / 2;

      const baseYs = Array.from(
        { length: NUM_LINES },
        (_, i) => midY - ((NUM_LINES - 1) * GAP) / 2 + i * GAP,
      );

      WAVE_LINES.forEach((cfg) => {
        const baseY = baseYs[WAVE_LINES.indexOf(cfg)];
        const scroll =
          scrollOffsetRef.current * cfg.scrollSpeed + cfg.scrollPhase;
        const freq = ((2 * Math.PI) / W) * 1.5;
        const breath =
          1 +
          0.3 * Math.sin(tRef.current * cfg.wlSpeed * 1.7 + cfg.wlPhase + 1.2);
        const amp = H * cfg.amp * mt * breath;

        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 11;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const y = baseY + Math.sin(freq * x - scroll) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const y = baseY + Math.sin(freq * x - scroll) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    syncSize();
    rafRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [isPlaying, track?.id, track?.videoId, hideWaves]);

  return (
    <div
      ref={frameRef}
      className="flex flex-col text-white items-center justify-between   sm:rounded-[28px] max-sm:p-0  sm:p-3 h-full  sm:h-full overflow-hidden w-full relative"
    >
      {!hideWaves && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-0"
        />
      )}
      {/*<div className=" w-full py-4 px-4.5 sm:p-0 sm:absolute top-3 left-3 sm:rounded-full "></div>*/}
      <div className="w-full flex  items-center justify-between pt-4 pb  pb-8 px-4 sm:p-0 sm:pb-6  ">
        <Image
          width={1200}
          height={1200}
          src={"/logo/tvlogo.svg"}
          alt={"logo"}
          priority
          className="w-13  sm:w-14 -mt-1 "
        />
        <Profile size="lg" />
      </div>
      <div className="w-full flex flex-col justify-center items-center h-fit">
        <div
          ref={wrapRef}
          className="w-[70%] aspect-square sm:w-[clamp(4rem,39vh,1000rem)]  rounded-xl overflow-hidden mb-3 border border-white/10 relative select-none shadow-[0_0_40px_-8px_rgba(255,255,255,0.15)] mx-auto"
        >
          <img
            src={albumArt}
            alt={title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>

        <div className="w-[90%] flex justify-center overflow-hidden items-center mb-3 shrink-0">
          <div className="text-center w-fit flex-1">
            <p className="text-white text-lg  sm:text-base truncate tracking-wide">
              {displayTitle}
            </p>
            {subtitle && (
              <p className="text-white/70 text-[10px] sm:text-xs truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="w-[78%] sm:w-[70%] px-2 my-2 shrink-0">
          <div className="flex  items-center gap-2">
            <span className="text-[10px] text-white/80 tabular-nums w-7 text-right shrink-0">
              {fmtSec(currentTime)}
            </span>
            <div className="flex-1">
              <Slider
                value={currentTime}
                onValueChange={(v) => onSeek?.(v)}
                min={0}
                max={Math.max(duration, 1)}
                step={0.5}
                className="cursor-pointer"
                trackClassName="h-1.25  bg-white/10"
                rangeClassName="bg-gradient-to-r  from-white/60 to-white"
                thumbClassName="bg-white"
              />
            </div>
            <span className="text-[10px] text-white/80 tabular-nums w-7 shrink-0">
              {fmtSec(duration)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 sm:gap-2 mt-3 flex-nowrap w-full select-none">
          <button
            onClick={onSkipBack}
            disabled={!onSkipBack}
            className=" text-white/80 hover:text-white hover:scale-110 rounded-full transition-all disabled:opacity-30 cursor-pointer"
            aria-label="Previous"
          >
            <Icon name="skip-back" size={22} className="text-current" />
          </button>
          <div className="h-14 w-14 items-center flex justify-center rounded-full p-0.5 border-[2.5] border-white">
            <button
              onClick={onPlayPause}
              disabled={!onPlayPause}
              className="flex w-full h-full items-center justify-center rounded-full bg-white text-black fill-black  transition-all shadow-[0_0_24px_-4px_rgba(255,255,255,0.3)] hover:shadow-[0_0_32px_-4px_rgba(255,255,255,0.5)] shrink-0 cursor-pointer"
              aria-label={isPlaying && !forcePlayIcon ? "Pause" : "Play"}
            >
              {isLoading ? (
                <Icon name="pause" size={20} className="text-black" />
              ) : isPlaying && !forcePlayIcon ? (
                <Icon name="pause" size={20} className="text-black" />
              ) : (
                <Icon name="play" size={20} className="text-black " />
              )}
            </button>
          </div>
          <button
            onClick={onSkipForward}
            disabled={!onSkipForward}
            className=" text-white/80 hover:text-white hover:scale-110  rounded-full transition-all disabled:opacity-30 cursor-pointer"
            aria-label="Next"
          >
            <Icon name="skip-forward" size={22} className="text-current" />
          </button>
          <button
            onClick={onMute}
            className="s ml-2 text-white hover:text-white rounded-full transition-all cursor-pointer shrink-0"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <Icon name="vol-none" size={20} className="text-white/80" />
            ) : volume < 50 ? (
              <Icon name="vol-mid" size={20} className="text-white/80" />
            ) : (
              <Icon name="vol-full" size={20} className="text-white/80" />
            )}
          </button>
          <div className="w-16 sm:w-22 shrink-0">
            <Slider
              value={isMuted ? 0 : volume}
              onValueChange={onVolume}
              min={0}
              max={100}
              step={1}
              className="cursor-pointer"
              trackClassName="h-1.25 -mb-0.75 bg-white/20"
              rangeClassName="bg-white -mb-0.75"
              thumbClassName="bg-white -mb-0.75"
            />
          </div>

          {onToggleLike && (
            <button
              onClick={onToggleLike}
              className={`rounded-full ml-2 transition-all cursor-pointer shrink-0 ${
                isLiked
                  ? "text-rose-500 "
                  : "text-white/50 hover:text-white hover:scale-105 "
              }`}
              aria-label={isLiked ? "Unlike track" : "Like track"}
              title={isLiked ? "Unlike track" : "Like track"}
            >
              <Icon
                name={isLiked ? "favorite" : "heart"}
                size={25}
                className={isLiked ? "text-rose-500" : "text-current"}
              />
            </button>
          )}
        </div>
      </div>
      <div className="w-full pt-6 flex justify-between items-center -ml-4 sm:-ml-1 -mt-4 px-4 sm:px-1">
        <div className="flex gap-2 items-center">
          {track?.videoId && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="hover:scale-110 transition-all duration-300 text-white/80 hover:text-white disabled:opacity-50 cursor-pointer"
              aria-label="Download"
              title="Download"
            >
              <DownloadSimpleIcon size={22} weight="regular" />
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <a
            href="https://github.com/bluwwi/blu3"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110   transition-all duration-300 text-white/80 hover:text-white"
          >
            <Icon name="github" size={21} className="text-current -mt-1" />
          </a>
          <a
            href="https://x.com/bluwixyz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110   transition-all duration-300 text-white/80 hover:text-white"
          >
            <XLogoIcon size={22} />
          </a>
        </div>
      </div>
    </div>
  );
}
