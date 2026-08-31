"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Trash2, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Profile } from "@/components/Profile";
import JoinCodeInput from "@/components/JoinCodeInput";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface LastTrack {
  videoId: string;
  trackName: string;
  artistName: string;
  image: string;
  playedAt: string;
}

interface RoomInfo {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  isActive: boolean;
  createdAt: string;
  lastTrack?: LastTrack | null;
}

function useRooms(user: any, authLoading: boolean) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("blu3_token");

    fetch(`${API_URL}/api/rooms/user/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setRooms(data.rooms ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const removeRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  };

  return { rooms, loading, removeRoom };
}

export default function BrowsePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { rooms, loading, removeRoom } = useRooms(user, authLoading);
  const [creating, setCreating] = useState(false);
  const autoCreated = useRef(false);

  useEffect(() => {
    if (loading || !user || rooms.length > 0 || autoCreated.current) return;
    autoCreated.current = true;
    const token = localStorage.getItem("blu3_token");
    const roomName = "Room " + Math.floor(1000 + Math.random() * 9000);
    fetch(`${API_URL}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: roomName }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.room) router.replace(`/room/${data.room.code}`);
      })
      .catch(() => {
        autoCreated.current = false;
      });
  }, [loading, user, rooms, router]);

  const handleJoin = (code: string) => {
    if (!code.trim()) return;
    router.push(`/room/${code.trim().toUpperCase()}`);
  };

  const handleCreate = async () => {
    setCreating(true);
    const token = localStorage.getItem("blu3_token");
    try {
      const name = Array.from(
        { length: 16 },
        () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)],
      ).join("");
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.room) router.push(`/room/${data.room.code}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (e: React.MouseEvent, room: RoomInfo) => {
    e.stopPropagation();
    if (!confirm(`Delete room "${room.name}"? This cannot be undone.`)) return;
    const token = localStorage.getItem("blu3_token");
    try {
      const res = await fetch(`${API_URL}/api/rooms/${room.code}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) removeRoom(room.id);
    } catch (err) {
    }
  };

  const handleLeaveRoom = async (e: React.MouseEvent, room: RoomInfo) => {
    e.stopPropagation();
    if (!confirm(`Leave room "${room.name}"?`)) return;
    const token = localStorage.getItem("blu3_token");
    try {
      const res = await fetch(`${API_URL}/api/rooms/${room.code}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) removeRoom(room.id);
    } catch (err) {
    }
  };

  const SkeletonCard = () => (
    <div className="flex flex-col gap-2 w-28 sm:w-32 md:w-36 lg:w-48">
      <div className="aspect-square rounded-md bg-white/5 animate-pulse" />
      <div className="h-2.5 w-3/4 bg-white/5 rounded animate-pulse mt-1" />
      <div className="h-2 w-1/2 bg-white/5 rounded animate-pulse" />
    </div>
  );

  return (
    <div className="min-h-screen  bg-linear-to-b from-black to-blue-950 max-h-screen h-dvh relative overflow-hidden">
      <div className="flex justify-center items-center z-10 h-full w-full overflow-hidden">
        <div className="flex flex-col justify-center items-center h-full w-full">
          <div className="flex justify-between w-full absolute top-0 p-5 items-center overflow-hidden before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none z-20  before:to-transparent">
            <img
              src={"/logo/tvlogo.svg"}
              alt={"logo"}
              className="w-14"
            />
            <div className="relative z-10 w-fit aspect-square">
              <Profile size="md" />
            </div>
          </div>

          <ScrollArea className="flex flex-col items-center justify-center mt-6 sm:mt-0 h-full w-full">
            <div className="flex flex-wrap items-center justify-center content-center gap-6 py-16 px-6 w-full min-h-full">
              {loading
                ? Array.from({ length: 9 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))
                : rooms.map((room) => {
                    const isHost = room.hostId === user?.id;
                    return (
                      <div
                        key={room.id}
                        className="room-card flex flex-col gap-2 relative group/card w-28 sm:w-32 md:w-36 lg:w-40"
                        onClick={() => router.push(`/room/${room.code}`)}
                      >
                        <div className="relative aspect-square  overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] before:absolute before:inset-0  before:pointer-events-none  before:to-transparent">
                          {room.lastTrack?.image ? (
                            <img
                              src={room.lastTrack.image}
                              alt={room.name}
                              className="room-card-img rounded-md w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.src = "/queue/pfp.jpg"; }}
                            />
                          ) : (
                            <img
                              src={"/queue/pfp.jpg"}
                              alt={room.name}
                              className="room-card-img rounded-md w-full h-full object-cover"
                            />
                          )}

                          <div className="room-play-overlay hover:border-2  border-white rounded-md  cursor-pointer absolute inset-0 flex items-center justify-center"></div>

                          <button
                            onClick={(e) =>
                              isHost
                                ? handleDeleteRoom(e, room)
                                : handleLeaveRoom(e, room)
                            }
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-600 hover:border-red-400/40 cursor-pointer z-10"
                            title={isHost ? "Delete room" : "Leave room"}
                          >
                            <Plus className="w-6 h-6 rotate-45 text-white/80" />
                          </button>
                        </div>
                        <div className="px-0.5 mt-1 flex overflow-hidden relative w-full items-center">
                          <p className="text-xs md:text-[14px]   text-white truncate  leading-tight">
                            {room.code} • {room.hostName}
                          </p>
                        </div>
                      </div>
                    );
                  })}

              {!loading && (
                <div
                  className="create-card flex flex-col gap-2 w-28 sm:w-32 md:w-36 lg:w-40 cursor-pointer"
                  onClick={handleCreate}
                >
                  <div className="aspect-square text-neutral-500 hover:text-neutral-300  border-2 border-dashed border-white/30 hover:border-white/40 backdrop-blur-2xl flex items-center justify-center  rounded-lg transition-all shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]">
                    <Plus
                      className="create-plus w-30 h-30  transition-all"
                      strokeWidth={2.25}
                    />
                  </div>
                  <div className="px-0.5 mt-1 flex overflow-hidden relative w-full items-center">
                    <p className="text-xs md:text-[14px] w-full uppercase text-center  text-white truncate  leading-tight">
                      Create Room
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <JoinCodeInput handleJoin={handleJoin} />
    </div>
  );
}
