import type { ReactNode } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="font-mono text-base tracking-wide text-rose-700 uppercase sm:text-sm">
          {eyebrow}
        </p>
        <h1
          tabIndex={-1}
          className="text-4xl font-semibold tracking-tight text-balance outline-none sm:text-5xl"
        >
          {title}
        </h1>
        <p className="max-w-[56ch] text-base text-pretty text-zinc-600">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
