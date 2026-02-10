"use client";

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
    setEditingId(chatId);
  }

  async function saveRename() {
    if (!editingId || !editingValue.trim()) {
      setEditingId(null);
      return;
    }
    const newTitle = editingValue.trim();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setEditingId(null);
      return;
    }
    await supabase
      .from("chats")
      .update({ title: newTitle })
      .eq("id", editingId)
      .eq("user_id", user.id);
    setChats((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, title: newTitle } : c))
    );
    setEditingId(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingValue("");
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 p-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {error && (
          <p className="px-3 py-2 text-sm text-red-600">Erreur: {error}</p>
        )}
        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
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
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
                        aria-label="Nouveau nom de la conversation"
                      />
                    </div>
                  ) : (
                    <Link
                      href={`/c/${chat.id}`}
                      className={`group flex items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm text-neutral-700 line-clamp-2 transition hover:bg-neutral-100 ${
                        isActive ? "bg-neutral-100" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {chat.title || "Sans titre"}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => startEditing(e, chat.id)}
                          className="rounded p-1 opacity-0 transition hover:bg-neutral-200 hover:opacity-100 group-hover:opacity-70"
                          aria-label="Renommer"
                        >
                          <Pencil className="h-3.5 w-3.5 text-neutral-500" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, chat.id)}
                          className="rounded p-1 opacity-0 transition hover:bg-neutral-200 hover:opacity-100 group-hover:opacity-70"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-neutral-500" />
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
    </aside>
  );
}
