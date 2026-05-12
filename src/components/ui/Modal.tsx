import React, { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Copy, Minus, Square, X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const MOBILE_BREAKPOINT = 768;
  const HEADER_HEIGHT = 56;
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 220;
  const RESIZE_HANDLE_SIZE = 10;

  type Rect = { x: number; y: number; width: number; height: number };
  type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

  const dragRef = useRef<{ startX: number; startY: number; startRect: Rect } | null>(null);
  const resizeRef = useRef<{ direction: ResizeDirection; startX: number; startY: number; startRect: Rect } | null>(null);
  const restoreRectRef = useRef<Rect | null>(null);

  const desktopWidthRatio = useMemo(() => {
    const ratios: Record<NonNullable<ModalProps['size']>, number> = {
      sm: 0.7,
      md: 0.7,
      lg: 0.7,
      xl: 0.7,
      '2xl': 0.7,
    };
    return ratios[size];
  }, [size]);

  const getViewport = useCallback(() => {
    if (typeof window === 'undefined') {
      return { width: 1440, height: 900 };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }, []);

  const normalizeRect = useCallback((rawRect: Rect, viewportWidth: number, viewportHeight: number): Rect => {
    const minWidth = Math.min(MIN_WIDTH, viewportWidth);
    const minHeight = Math.min(MIN_HEIGHT, viewportHeight);
    const width = Math.min(Math.max(rawRect.width, minWidth), viewportWidth);
    const height = Math.min(Math.max(rawRect.height, minHeight), viewportHeight);
    const x = Math.min(Math.max(rawRect.x, 0), Math.max(0, viewportWidth - width));
    const y = Math.min(Math.max(rawRect.y, 0), Math.max(0, viewportHeight - height));
    return { x, y, width, height };
  }, []);

  const getDefaultRect = useCallback((): Rect => {
    const viewport = getViewport();
    const isMobile = viewport.width < MOBILE_BREAKPOINT;
    const width = isMobile ? viewport.width : Math.round(viewport.width * desktopWidthRatio);
    const height = viewport.height;
    const x = isMobile ? 0 : viewport.width - width;
    return { x, y: 0, width, height };
  }, [desktopWidthRatio, getViewport]);

  const [rect, setRect] = useState<Rect>(() => getDefaultRect());
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const nextRect = getDefaultRect();
    setRect(nextRect);
    setIsMaximized(false);
    setIsMinimized(false);
    restoreRectRef.current = nextRect;
  }, [getDefaultRect, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      const viewport = getViewport();
      if (isMaximized) {
        setRect({ x: 0, y: 0, width: viewport.width, height: viewport.height });
        return;
      }
      setRect((previous) => normalizeRect(previous, viewport.width, viewport.height));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getViewport, isMaximized, isOpen, normalizeRect]);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMaximized || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-window-control="true"]')) return;

      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isMaximized, rect]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current) {
        const viewport = getViewport();
        const deltaX = event.clientX - dragRef.current.startX;
        const deltaY = event.clientY - dragRef.current.startY;
        const nextRect = normalizeRect(
          {
            ...dragRef.current.startRect,
            x: dragRef.current.startRect.x + deltaX,
            y: dragRef.current.startRect.y + deltaY,
          },
          viewport.width,
          viewport.height
        );
        setRect(nextRect);
      }

      if (resizeRef.current) {
        const viewport = getViewport();
        const deltaX = event.clientX - resizeRef.current.startX;
        const deltaY = event.clientY - resizeRef.current.startY;
        const startRect = resizeRef.current.startRect;
        const direction = resizeRef.current.direction;
        let nextRect = { ...startRect };

        if (direction.includes('e')) nextRect.width = startRect.width + deltaX;
        if (direction.includes('s')) nextRect.height = startRect.height + deltaY;
        if (direction.includes('w')) {
          nextRect.width = startRect.width - deltaX;
          nextRect.x = startRect.x + deltaX;
        }
        if (direction.includes('n')) {
          nextRect.height = startRect.height - deltaY;
          nextRect.y = startRect.y + deltaY;
        }

        setRect(normalizeRect(nextRect, viewport.width, viewport.height));
      }
    },
    [getViewport, normalizeRect]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  const startResize = useCallback(
    (direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
      if (isMaximized || isMinimized || event.button !== 0) return;
      resizeRef.current = {
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.stopPropagation();
    },
    [isMaximized, isMinimized, rect]
  );

  const onToggleMaximize = useCallback(() => {
    const viewport = getViewport();
    if (!isMaximized) {
      if (!isMinimized) {
        restoreRectRef.current = rect;
      }
      setRect({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      setIsMinimized(false);
      setIsMaximized(true);
      return;
    }

    const restoreRect = restoreRectRef.current ?? getDefaultRect();
    setRect(normalizeRect(restoreRect, viewport.width, viewport.height));
    setIsMaximized(false);
  }, [getDefaultRect, getViewport, isMaximized, isMinimized, normalizeRect, rect]);

  const onToggleMinimize = useCallback(() => {
    const viewport = getViewport();
    if (!isMinimized) {
      if (!isMaximized) {
        restoreRectRef.current = rect;
      }
      const minimizedWidth = Math.min(Math.max(320, Math.min(rect.width, 420)), viewport.width);
      setRect({
        x: Math.max(0, viewport.width - minimizedWidth - 16),
        y: Math.max(0, viewport.height - HEADER_HEIGHT - 16),
        width: minimizedWidth,
        height: HEADER_HEIGHT,
      });
      setIsMaximized(false);
      setIsMinimized(true);
      return;
    }

    const restoreRect = restoreRectRef.current ?? getDefaultRect();
    setRect(normalizeRect(restoreRect, viewport.width, viewport.height));
    setIsMinimized(false);
  }, [getDefaultRect, getViewport, isMaximized, isMinimized, normalizeRect, rect]);

  const panelStyle = useMemo(
    () => ({
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }),
    [rect]
  );

  const resizeHandles: Array<{ direction: ResizeDirection; className: string; cursor: string }> = [
    { direction: 'n', className: 'left-2 right-2 top-0 h-2', cursor: 'ns-resize' },
    { direction: 's', className: 'bottom-0 left-2 right-2 h-2', cursor: 'ns-resize' },
    { direction: 'e', className: 'bottom-2 right-0 top-2 w-2', cursor: 'ew-resize' },
    { direction: 'w', className: 'bottom-2 left-0 top-2 w-2', cursor: 'ew-resize' },
    { direction: 'ne', className: 'right-0 top-0 h-3 w-3', cursor: 'nesw-resize' },
    { direction: 'nw', className: 'left-0 top-0 h-3 w-3', cursor: 'nwse-resize' },
    { direction: 'se', className: 'bottom-0 right-0 h-3 w-3', cursor: 'nwse-resize' },
    { direction: 'sw', className: 'bottom-0 left-0 h-3 w-3', cursor: 'nesw-resize' },
  ];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transform transition ease-in-out duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                style={panelStyle}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`absolute transform overflow-hidden bg-white shadow-2xl transition-all dark:bg-slate-900 ${
                  isMaximized ? '' : 'rounded-xl'
                }`}
              >
                <div className="flex h-full flex-col">
                  <div
                    onPointerDown={startDrag}
                    className="flex cursor-move select-none items-center justify-between gap-3 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900"
                  >
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
                      {title}
                    </Dialog.Title>
                    <div className="flex items-center gap-1">
                      <button
                        data-window-control="true"
                        onClick={onToggleMinimize}
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        aria-label={isMinimized ? 'Restore dialog' : 'Minimize dialog'}
                        type="button"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        data-window-control="true"
                        onClick={onToggleMaximize}
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        aria-label={isMaximized ? 'Restore dialog size' : 'Maximize dialog'}
                        type="button"
                      >
                        {isMaximized ? <Copy className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </button>
                      <button
                        data-window-control="true"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-500 hover:text-white dark:text-gray-300 dark:hover:bg-red-600"
                        aria-label="Close dialog"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {!isMinimized ? (
                    <>
                      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
                      {footer ? (
                        <div className="border-t border-gray-200 bg-gray-50/90 px-6 py-4 dark:border-slate-700 dark:bg-slate-950/80">
                          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {!isMaximized && !isMinimized
                    ? resizeHandles.map((handle) => (
                        <div
                          key={handle.direction}
                          onPointerDown={(event) => startResize(handle.direction, event)}
                          className={`absolute ${handle.className}`}
                          style={{ cursor: handle.cursor, minWidth: `${RESIZE_HANDLE_SIZE}px`, minHeight: `${RESIZE_HANDLE_SIZE}px` }}
                        />
                      ))
                    : null}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
