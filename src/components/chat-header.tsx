"use client";

import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthButton } from "@/components/AuthButton";

export function ChatHeader() {
  const pathname = usePathname();
  const [title, setTitle] = useState("Assistant Volteyr");

  useEffect(() => {
    const match = pathname?.match(/^\/c\/([^/]+)$/);
    if (!match) {
      setTitle("Assistant Volteyr");
      return;
    }
    const chatId = match[1];
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("title")
        .eq("id", chatId)
        .single();
      setTitle(error ? "Assistant Volteyr" : (data?.title || "Assistant Volteyr"));
    })();
  }, [pathname]);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
      <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
      <AuthButton />
    </header>
  );
}
