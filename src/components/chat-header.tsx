"use client";

import Image from "next/image";
import { AuthButton } from "@/components/AuthButton";

export function ChatHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-neutral-800 bg-black px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Image
          src="/full_logo.jpg"
          alt="Volteyr"
          width={140}
          height={36}
          className="h-9 w-auto object-contain"
          priority
        />
      </div>
      <AuthButton />
    </header>
  );
}
