"use client";

// Slide-to-confirm for the cart foot. The thumb has to travel essentially the full track
// before the action fires — a tap or a short drag snaps back. Keyboard: focus, then End
// or hold ArrowRight to the end.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const THUMB = 48;
const INSET = 4;
const COMPLETE_AT = 0.95;

type SlideToActionProps = {
  label: string;
  onComplete: () => void;
  className?: string;
};

export function SlideToAction({ label, onComplete, className }: SlideToActionProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [ratio, setRatio] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [travel, setTravel] = useState(0);
  const locked = useRef(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setTravel(Math.max(0, track.clientWidth - THUMB - INSET * 2));
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  const finish = useCallback((next: number) => {
    if (locked.current) return;
    if (next >= COMPLETE_AT) {
      locked.current = true;
      setRatio(1);
      window.setTimeout(() => onCompleteRef.current(), 90);
      return;
    }
    setRatio(0);
  }, []);

  const travelNow = () => {
    const track = trackRef.current;
    if (!track) return travel;
    return Math.max(0, track.clientWidth - THUMB - INSET * 2);
  };

  const ratioFromX = (clientX: number) => {
    const track = trackRef.current;
    const max = travelNow();
    if (!track || max <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left - INSET - THUMB / 2;
    return Math.min(1, Math.max(0, x / max));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (locked.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    measure();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setRatio(ratioFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || locked.current) return;
    setRatio(ratioFromX(e.clientX));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    finish(ratioFromX(e.clientX));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (locked.current) return;
    if (e.key === "End" || e.key === "Enter") {
      e.preventDefault();
      finish(1);
      return;
    }
    if (e.key === "Home" || e.key === "Escape") {
      e.preventDefault();
      setRatio(0);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(1, ratio + 0.12);
      setRatio(next);
      if (next >= COMPLETE_AT) finish(1);
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setRatio((r) => Math.max(0, r - 0.12));
    }
  };

  const value = Math.round(ratio * 100);

  return (
    <div
      ref={trackRef}
      className={cn("slide-act", dragging && "is-dragging", ratio >= 1 && "is-done", className)}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={ratio >= COMPLETE_AT ? "Ready" : "Slide all the way to confirm"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={
        {
          "--slide-ratio": String(ratio),
          "--thumb-x": `${ratio * travel}px`,
        } as React.CSSProperties
      }
    >
      <span className="slide-act-label" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        className="slide-act-thumb"
        tabIndex={-1}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ChevronRight strokeWidth={2.6} />
      </button>
    </div>
  );
}
