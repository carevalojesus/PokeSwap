import { CircleAlert, Clock3, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageState({
  title,
  description,
  kind = 'soon',
  action,
}: {
  title: string;
  description: string;
  kind?: 'soon' | 'empty' | 'error';
  action?: ReactNode;
}) {
  const Icon = { soon: Clock3, empty: SearchX, error: CircleAlert }[kind];
  return (
    <section
      className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-950/10 p-6 sm:p-10"
      aria-label={title}
    >
      <Icon aria-hidden="true" className="size-6 shrink-0 stroke-rose-700" />
      <h2 className="text-xl font-medium text-balance">{title}</h2>
      <p className="max-w-[56ch] text-base text-pretty text-zinc-600">
        {description}
      </p>
      {action}
    </section>
  );
}
