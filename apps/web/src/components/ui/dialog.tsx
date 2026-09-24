"use client";

// Design v1.1 — the dialog. A bottom sheet below 768px, a centred 560px modal above it.
// No backdrop blur. Focus is trapped and returned on close.
//
// It arrives from below (the same motion as the hours sheet) and can be pulled down with a
// finger to dismiss. A tap on the dimmed page still closes it. Reduced motion turns the
// animation off; the swipe still closes.
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/ui/use-overlay";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  label?: string;
};

const EXIT_MS = 320;
const DISMISS_PX = 64;
const DISMISS_FLICK_PX = 28;
const DISMISS_FLICK_V = 0.35;
const ARM_PX = 6;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clientY(e: TouchEvent | PointerEvent): number | null {
  if ("changedTouches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return t ? t.clientY : null;
  }
  return e.clientY;
}

function clientX(e: TouchEvent | PointerEvent): number | null {
  if ("changedTouches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return t ? t.clientX : null;
  }
  return e.clientX;
}

function isDragGrip(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return Boolean(el?.closest(".modal-handle, .img"));
}

function scrollerOf(panel: HTMLElement): HTMLElement {
  return panel.querySelector<HTMLElement>(".modal-body") ?? panel;
}

/**
 * Pull-down to dismiss. The handle and photo always start a drag. Elsewhere, a downward
 * swipe only starts when the sheet body is already scrolled to the top.
 *
 * Listeners bind to the live panel node (callback ref) and move/end are on `document` so
 * iOS cannot drop the gesture when the finger leaves the handle. The scroll body is locked
 * for the duration of a drag so native overflow cannot steal it.
 */
function useDismissSwipe(panel: HTMLDivElement | null, enabled: boolean, onClose: () => void) {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!enabled || !panel) {
      setDragging(false);
      return;
    }
    setOffset(0);

    const start = {
      y: 0,
      x: 0,
      at: 0,
      armed: false,
      dragging: false,
      fromHandle: false,
    };
    let locked: { el: HTMLElement; overflow: string } | null = null;

    const lockScroll = () => {
      if (locked) return;
      const el = scrollerOf(panel);
      locked = { el, overflow: el.style.overflow };
      el.style.overflow = "hidden";
    };
    const unlockScroll = () => {
      if (!locked) return;
      locked.el.style.overflow = locked.overflow;
      locked = null;
    };

    const begin = (e: TouchEvent | PointerEvent) => {
      if ("pointerType" in e && e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const fromHandle = isDragGrip(target);
      if (!fromHandle && target?.closest("input, textarea, select, button, a, label")) return;
      const y = clientY(e);
      const x = clientX(e);
      if (y == null || x == null) return;
      start.y = y;
      start.x = x;
      start.at = performance.now();
      start.armed = true;
      start.dragging = false;
      start.fromHandle = fromHandle;
    };

    const move = (e: TouchEvent | PointerEvent) => {
      if (!start.armed) return;
      const y = clientY(e);
      const x = clientX(e);
      if (y == null || x == null) return;
      const dy = y - start.y;
      const dx = x - start.x;
      if (!start.dragging) {
        if (Math.abs(dy) < ARM_PX && Math.abs(dx) < ARM_PX) return;
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
          start.armed = false;
          return;
        }
        if (!start.fromHandle && scrollerOf(panel).scrollTop > 1) {
          start.armed = false;
          return;
        }
        start.dragging = true;
        setDragging(true);
        lockScroll();
      }
      if (e.cancelable) e.preventDefault();
      setOffset(Math.max(0, dy));
    };

    const finish = (e: TouchEvent | PointerEvent) => {
      if (!start.armed) return;
      const wasDragging = start.dragging;
      start.armed = false;
      start.dragging = false;
      unlockScroll();
      if (!wasDragging) {
        setDragging(false);
        return;
      }
      const y = clientY(e);
      const dy = Math.max(0, (y ?? start.y) - start.y);
      const elapsed = Math.max(1, performance.now() - start.at);
      const velocity = dy / elapsed;
      const close = dy >= DISMISS_PX || (dy >= DISMISS_FLICK_PX && velocity >= DISMISS_FLICK_V);
      setDragging(false);
      if (close) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && panel.contains(active)) active.blur();
        setOffset(Math.max(dy, window.innerHeight));
        // The finger is often still moving after we decide to close. Swallow the rest of
        // this gesture so it cannot scroll the page that we are about to uncover.
        const swallow = (ev: TouchEvent) => {
          if (ev.cancelable) ev.preventDefault();
        };
        document.addEventListener("touchmove", swallow, { passive: false });
        const stopSwallow = () => {
          document.removeEventListener("touchmove", swallow);
          document.removeEventListener("touchend", stopSwallow);
          document.removeEventListener("touchcancel", stopSwallow);
        };
        document.addEventListener("touchend", stopSwallow);
        document.addEventListener("touchcancel", stopSwallow);
        onCloseRef.current();
      } else {
        setOffset(0);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      begin(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      move(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      finish(e);
    };

    panel.addEventListener("touchstart", begin, { passive: true, capture: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", finish);
    panel.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      unlockScroll();
      panel.removeEventListener("touchstart", begin, true);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
      panel.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, panel]);

  return { offset, dragging };
}

export function Dialog({ open, onClose, children, className, labelledBy, label }: DialogProps) {
  const [presented, setPresented] = React.useState(open);
  const [phase, setPhase] = React.useState<"open" | "closing">("open");
  const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
  const { mounted, panelRef } = useOverlay(presented, onClose);
  const assignPanel = React.useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      setPanelNode(node);
    },
    [panelRef],
  );
  const swipeEnabled = Boolean(panelNode) && presented && phase === "open";
  const { offset, dragging } = useDismissSwipe(panelNode, swipeEnabled, onClose);

  React.useEffect(() => {
    if (open) {
      setPresented(true);
      setPhase("open");
      return;
    }
    if (!presented) return;
    setPhase("closing");
    const wait = prefersReducedMotion() ? 0 : EXIT_MS;
    const t = window.setTimeout(() => setPresented(false), wait);
    return () => window.clearTimeout(t);
  }, [open, presented]);

  if (!mounted || !presented) return null;

  const dragged = offset > 0;

  return createPortal(
    // `sf-root` travels with the portal: this panel is mounted on document.body, OUTSIDE the
    // storefront layout, so without the class the storefront's own tokens — including the dark
    // scheme — would not reach anything inside the modal.
    <div className="sf-root">
      <div
        className="overlay on"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
          onClose();
        }}
      >
        <div
          ref={assignPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          tabIndex={-1}
          className={cn(
            "modal on",
            dragging && "is-dragging",
            dragged && "is-pulled",
            phase === "closing" && !dragged && "is-closing",
            className,
          )}
          style={
            dragged
              ? ({
                  ["--sheet-y" as string]: `${offset}px`,
                  transition: dragging ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div className="modal-handle" aria-hidden="true" />
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
