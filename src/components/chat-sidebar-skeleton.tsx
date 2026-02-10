export function ChatSidebarSkeleton() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-black">
      <div className="border-b border-neutral-800 p-3">
        <div className="h-10 animate-pulse rounded-lg bg-neutral-800" />
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
        ))}
      </nav>
    </aside>
  );
}
