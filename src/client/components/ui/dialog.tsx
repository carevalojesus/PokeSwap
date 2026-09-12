// Adapted from shadcn/ui (New York), MIT. Radix owns focus trapping and restoration.
import type { ComponentProps } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title
      className={cn(
        'text-2xl font-semibold tracking-tight text-balance',
        className,
      )}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={cn('text-base text-pretty text-zinc-600', className)}
      {...props}
    />
  );
}
export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-zinc-950/50" />
      <Primitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-1/2 flex-col gap-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10',
          className,
        )}
        {...props}
      >
        <div className="pr-10">{children}</div>
        <Primitive.Close asChild>
          <Button
            variant="ghost"
            className="absolute top-4 right-4 size-9 p-0"
            aria-label="Cerrar ventana"
          >
            <X aria-hidden="true" />
          </Button>
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
