import { ChatHeader } from "@/components/chat-header";
import { ChatSidebar } from "@/components/chat-sidebar";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  return (
    <main className="flex h-screen bg-neutral-50">
      <ChatSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatHeader />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </main>
  );
}
