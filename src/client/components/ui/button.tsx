// Adapted from shadcn/ui (New York), MIT. See docs/INTERFAZ.md.
import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const variants = cva(
  'relative inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-700 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 after:absolute after:inset-x-0 after:top-1/2 after:min-h-12 after:-translate-y-1/2 after:pointer-fine:hidden',
  {
    variants: {
      variant: {
        default: 'bg-rose-700 text-white hover:bg-rose-800',
        outline:
          'border border-zinc-950/15 bg-white text-zinc-800 hover:bg-zinc-100',
        ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Button({
  className,
  variant,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      {...(!asChild && { type })}
      className={cn(variants({ variant }), className)}
      {...props}
    />
  );
}
