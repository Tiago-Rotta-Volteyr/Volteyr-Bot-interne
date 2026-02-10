export default function ChatAreaLoading() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex gap-3">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-neutral-800" />
          <div className="h-4 w-48 animate-pulse rounded bg-neutral-800" />
        </div>
        <div className="flex gap-3 flex-row-reverse">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-neutral-800" />
          <div className="h-4 w-64 animate-pulse rounded bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
