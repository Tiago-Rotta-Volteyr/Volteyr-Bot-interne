"use client";

import { AuthButton } from "@/components/AuthButton";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatItem = { id: string; title: string; created_at: string };

export function ChatSidebar() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (editingId) {
      setEditingValue(chats.find((c) => c.id === editingId)?.title ?? "");
      editInputRef.current?.focus();
    }
  }, [editingId, chats]);

  const fetchChats = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from("chats")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setError(err?.message ?? null);
    setChats((data as ChatItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    const handler = () => fetchChats();
    window.addEventListener("chat-created", handler);
    return () => window.removeEventListener("chat-created", handler);
  }, [fetchChats]);

  async function handleDelete(e: React.MouseEvent, chatId: string) {
    e.preventDefault();
    e.stopPropagation();
    const supabase = createClient();
    await supabase.from("chats").delete().eq("id", chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (pathname === `/c/${chatId}`) {
      router.push("/");
    }
  }

  function startEditing(e: React.MouseEvent, chatId: string) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setEditingId(chatId);
  }

  async function saveRename() {
    if (!editingId || !editingValue.trim()) {
      setEditingId(null);
      return;
    }
    const newTitle = editingValue.trim();
    const res = await fetch("/api/chat/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: editingId, title: newTitle }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "Erreur lors du renommage");
      return;
    }
    setError(null);
    setChats((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, title: newTitle } : c))
    );
    setEditingId(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingValue("");
    setError(null);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-black">
      <div className="border-b border-neutral-800 p-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/50 px-3 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800 hover:border-neutral-600"
        >
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {error && (
          <p className="px-3 py-2 text-sm text-red-400">Erreur: {error}</p>
        )}
        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => {
              const isActive = pathname === `/c/${chat.id}`;
              const isEditing = editingId === chat.id;
              return (
                <li key={chat.id}>
                  {isEditing ? (
                    <div className="rounded-lg px-3 py-2">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={saveRename}
                        className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                        aria-label="Nouveau nom de la conversation"
                      />
                    </div>
                  ) : (
                    <Link
                      href={`/c/${chat.id}`}
                      className={`group flex items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm line-clamp-2 transition ${
                        isActive
                          ? "bg-neutral-700 text-neutral-100"
                          : "bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {chat.title || "Sans titre"}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => startEditing(e, chat.id)}
                          className="rounded p-1 opacity-60 transition hover:bg-neutral-600 hover:opacity-100 text-neutral-400 hover:text-neutral-100"
                          aria-label="Renommer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, chat.id)}
                          className="rounded p-1 opacity-60 transition hover:bg-neutral-600 hover:opacity-100 text-neutral-400 hover:text-neutral-100"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <div className="shrink-0 border-t border-neutral-800 p-3">
        <AuthButton />
      </div>
    </aside>
  );
}
