import { ReactNode } from 'react';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function RightDrawer({ isOpen, onClose, title, subtitle, children }: RightDrawerProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-[#10090d]/45 backdrop-blur-[1px]" aria-hidden="true" />
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-4">
            <Dialog.Panel className="pointer-events-auto w-[70vw] max-w-[1080px] min-w-[320px] transform transition-transform duration-300 ease-out">
              <div className="flex h-full flex-col border-l border-akiva-border bg-akiva-surface-raised text-akiva-text shadow-xl">
                <div className="flex items-start justify-between border-b border-akiva-border px-4 py-3">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-akiva-text">
                      {title}
                    </Dialog.Title>
                    {subtitle ? (
                      <p className="mt-0.5 text-xs text-akiva-text-muted">{subtitle}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-2 text-akiva-text-muted hover:bg-akiva-accent-soft hover:text-akiva-accent-text"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
