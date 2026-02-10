import { Suspense } from "react";
import { AuthButton } from "@/components/AuthButton";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatSidebarSkeleton } from "@/components/chat-sidebar-skeleton";

interface ChatLayoutProps {
  children: React.ReactNode;
  headerTitle?: string;
}

export function ChatLayout({ children, headerTitle = "Assistant Volteyr" }: ChatLayoutProps) {
  return (
    <main className="flex h-screen bg-neutral-50">
      <Suspense fallback={<ChatSidebarSkeleton />}>
        <ChatSidebar />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <h1 className="text-lg font-semibold text-neutral-900">{headerTitle}</h1>
          <AuthButton />
        </header>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </main>
  );
}
