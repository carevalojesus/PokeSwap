// Adapted from shadcn/ui (New York), MIT.
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Input({
  className,
  type = 'text',
  ...props
}: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-12 w-full min-w-0 rounded-xl border border-zinc-950/20 bg-white px-3 text-base placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-rose-700 disabled:opacity-50 aria-invalid:border-red-700',
        className,
      )}
      {...props}
    />
  );
}
