import { Fragment, ReactNode, useCallback, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

type ConfirmTone = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface PendingConfirm extends Required<Pick<ConfirmOptions, 'title' | 'confirmLabel' | 'cancelLabel' | 'tone'>> {
  description?: ReactNode;
  detail?: ReactNode;
}

function toneClasses(tone: ConfirmTone) {
  if (tone === 'info') {
    return {
      iconWrap: 'bg-akiva-accent-soft text-akiva-accent-text',
      confirm: 'bg-akiva-accent text-white hover:bg-akiva-accent-hover focus:ring-akiva-accent',
      Icon: Info,
    };
  }

  if (tone === 'warning') {
    return {
      iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200',
      confirm: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500',
      Icon: AlertTriangle,
    };
  }

  return {
    iconWrap: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
    confirm: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    Icon: Trash2,
  };
}

export function useConfirmDialog() {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolverRef.current?.(false);
    setPending({
      title: options.title,
      description: options.description,
      detail: options.detail,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      tone: options.tone ?? 'danger',
    });

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog = pending ? (
    <Transition appear show as={Fragment}>
      <Dialog as="div" className="relative z-[2147483647]" onClose={() => close(false)}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-3 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 translate-y-3 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface shadow-2xl shadow-slate-900/20 dark:shadow-black/40">
                <div className="flex gap-3 px-4 py-4 sm:px-5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClasses(pending.tone).iconWrap}`}>
                    {(() => {
                      const Icon = toneClasses(pending.tone).Icon;
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <Dialog.Title className="text-base font-semibold text-akiva-text">{pending.title}</Dialog.Title>
                    {pending.description ? (
                      <Dialog.Description className="mt-1 text-sm leading-6 text-akiva-text-muted">
                        {pending.description}
                      </Dialog.Description>
                    ) : null}
                  </div>
                </div>

                {pending.detail ? (
                  <div className="mx-4 rounded-lg border border-akiva-border bg-akiva-surface-muted px-3 py-2 text-sm text-akiva-text sm:mx-5">
                    {pending.detail}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col-reverse gap-2 border-t border-akiva-border bg-akiva-surface-muted px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface px-4 text-sm font-semibold text-akiva-text transition hover:bg-akiva-surface-raised focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                  >
                    {pending.cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-akiva-surface ${toneClasses(pending.tone).confirm}`}
                  >
                    {pending.confirmLabel}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  ) : null;

  return { confirm, confirmationDialog: dialog };
}
