export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex gap-3"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
