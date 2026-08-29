// Kitchen display PWA — PIN pad, order board, poll, alerts, offline retain.
// Design v1.1: the board is one auto-filling grid of cards on the dark KDS surface, each card
// carrying the ticket chip, the printed elapsed time, full-weight modifiers and its own next
// action. The queue, the transitions, the escalation thresholds and the audio rules are
// unchanged — only the presentation is the design's.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KitchenQueueOrder, KitchenQueueResponse, KitchenStaffPublic } from "@harolds/types";
import { KitchenErrorCode } from "@harolds/types";
import {
  fetchQueue,
  fetchRoster,
  fetchSession,
  KitchenApiError,
  signIn,
  signOut,
  transitionOrder,
} from "@/lib/kitchen-api";
import { playNewTicketChime, playUnackedAlert, unlockKitchenAudio } from "@/lib/kitchen-audio";
import { escalationLevel, formatElapsed, nextActionLabel, nextActionStatus } from "@/lib/kitchen-escalation";
import { appearedOrderIds } from "@/lib/kitchen-queue-diff";
import {
  clearSessionToken,
  readAudioUnlocked,
  readSessionToken,
  writeAudioUnlocked,
  writeSessionToken,
} from "@/lib/kitchen-storage";

type View = "boot" | "signin" | "board";

function printerHealthLine(queue: KitchenQueueResponse | null): { text: string; stuck: boolean } {
  if (!queue) return { text: "Printer: —", stuck: false };
  const p = queue.printHealth.printers[0];
  const last = p?.lastPolledAt ? new Date(p.lastPolledAt) : null;
  const age = last ? Date.now() - last.getTime() : null;
  const failed = queue.printHealth.counts.FAILED ?? 0;
  const sent = queue.printHealth.counts.SENT ?? 0;
  const queued = (queue.printHealth.counts.QUEUED ?? 0) + sent;
  const stuck = failed > 0 || sent > 2 || (age !== null && age > 30_000) || last === null;
  const lastLabel = last ? `${Math.max(0, Math.round((age ?? 0) / 1000))}s ago` : "never";
  return {
    text: `Printer ${p?.serial ?? "?"} last poll ${lastLabel} · queued ${queued}`,
    stuck,
  };
}

export function KitchenApp() {
  const [view, setView] = useState<View>("boot");
  const [token, setToken] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [roster, setRoster] = useState<KitchenStaffPublic[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockoutUntil, setLockoutUntil] = useState<string | null>(null);
  const [lockoutNow, setLockoutNow] = useState(() => Date.now());
  const [queue, setQueue] = useState<KitchenQueueResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The design draws an explicit audio-unlock panel over the board. Android will not play the
  // chime until the page has been touched once, so the board says so rather than staying
  // silently broken.
  const [audioUnlocked, setAudioUnlocked] = useState(true);
  const prevIds = useRef<string[] | null>(null);
  const pollMs = queue?.pollIntervalMs ?? 3000;
  const screenMs = queue?.unackScreenMs ?? 60_000;
  const soundMs = queue?.unackSoundMs ?? 120_000;

  const onAuthFailure = useCallback(() => {
    clearSessionToken();
    setToken(null);
    setQueue(null);
    prevIds.current = null;
    setView("signin");
  }, []);

  const unlockAudio = useCallback(async () => {
    const ok = await unlockKitchenAudio();
    if (ok) writeAudioUnlocked();
  }, []);

  useEffect(() => {
    setAudioUnlocked(readAudioUnlocked());
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readSessionToken();
      try {
        const staff = await fetchRoster();
        if (!cancelled) setRoster(staff);
      } catch {
        /* roster is best-effort on boot */
      }
      if (!stored) {
        if (!cancelled) setView("signin");
        return;
      }
      try {
        const session = await fetchSession(stored);
        if (cancelled) return;
        setToken(stored);
        setStaffName(session.user.displayName);
        setView("board");
      } catch (err) {
        if (err instanceof KitchenApiError && err.isAuthFailure) {
          onAuthFailure();
          return;
        }
        if (!cancelled) setView("signin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onAuthFailure]);

  useEffect(() => {
    if (view !== "board" || !token) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await fetchQueue(token);
        if (stopped) return;
        const ids = next.orders.map((o) => o.id);
        if (prevIds.current) {
          const appeared = appearedOrderIds(prevIds.current, ids);
          if (appeared.length > 0) {
            setNewIds((cur) => new Set([...cur, ...appeared]));
            if (readAudioUnlocked()) playNewTicketChime();
            window.setTimeout(() => {
              setNewIds((cur) => {
                const copy = new Set(cur);
                for (const id of appeared) copy.delete(id);
                return copy;
              });
            }, 8000);
          }
        }
        prevIds.current = ids;
        setQueue(next);
        setDegraded(false);
      } catch (err) {
        if (err instanceof KitchenApiError && err.isAuthFailure) {
          onAuthFailure();
          return;
        }
        if (!stopped) setDegraded(true);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [view, token, pollMs, onAuthFailure]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;
    const id = window.setInterval(() => setLockoutNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  useEffect(() => {
    if (view !== "board") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    let sentinel: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        sentinel = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* unsupported or denied — documented in the kiosk runbook */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [view]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/kitchen-sw.js", { scope: "/kitchen" });
    }
  }, []);

  const sounding = useMemo(() => {
    if (!queue) return false;
    return queue.orders.some(
      (o) =>
        escalationLevel({
          status: o.status,
          paidAt: o.paidAt,
          nowMs,
          screenMs,
          soundMs,
        }) === "sound",
    );
  }, [queue, nowMs, screenMs, soundMs]);

  useEffect(() => {
    if (!sounding || !readAudioUnlocked()) return;
    playUnackedAlert();
    const id = window.setInterval(() => playUnackedAlert(), 8000);
    return () => window.clearInterval(id);
  }, [sounding]);

  const submitPin = async () => {
    if (!selectedUserId || pin.length < 4) return;
    setAuthError(null);
    await unlockAudio();
    try {
      const issued = await signIn(selectedUserId, pin);
      writeSessionToken(issued.token);
      setToken(issued.token);
      setStaffName(issued.user.displayName);
      setPin("");
      setLockoutUntil(null);
      setView("board");
    } catch (err) {
      if (err instanceof KitchenApiError && err.code === KitchenErrorCode.PIN_LOCKED) {
        const until = typeof err.details?.lockedUntil === "string" ? err.details.lockedUntil : null;
        setLockoutUntil(until);
        setAuthError(err.message);
        return;
      }
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const advance = async (order: KitchenQueueOrder) => {
    if (!token) return;
    const to = nextActionStatus(order.status);
    if (!to) return;
    setBusyId(order.id);
    try {
      await transitionOrder(token, order.id, to);
      const next = await fetchQueue(token);
      prevIds.current = next.orders.map((o) => o.id);
      setQueue(next);
      setDegraded(false);
    } catch (err) {
      if (err instanceof KitchenApiError && err.isAuthFailure) onAuthFailure();
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async () => {
    if (!token || !cancelId) return;
    setBusyId(cancelId);
    try {
      await transitionOrder(token, cancelId, "CANCELLED");
      const next = await fetchQueue(token);
      prevIds.current = next.orders.map((o) => o.id);
      setQueue(next);
    } catch (err) {
      if (err instanceof KitchenApiError && err.isAuthFailure) onAuthFailure();
    } finally {
      setBusyId(null);
      setCancelId(null);
    }
  };

  const health = printerHealthLine(queue);
  const lockoutLeft = lockoutUntil
    ? Math.max(0, Math.ceil((Date.parse(lockoutUntil) - lockoutNow) / 1000))
    : 0;

  if (view === "boot") {
    return (
      <div className="kds-signin">
        <div className="kds-signin-card">
          <p className="kds-kicker">Harold&apos;s Oak Lawn</p>
          <h1 className="kds-title">Kitchen</h1>
        </div>
      </div>
    );
  }

  if (view === "signin") {
    return (
      <div className="kds-signin">
        <div className="kds-signin-card">
          <p className="kds-kicker">Kitchen display</p>
          <h1 className="kds-title">Sign in</h1>
          <p className="kds-sub">Tap your name, then the PIN. First tap also unlocks alert sound.</p>
          <div className="kds-roster">
            {roster.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={selectedUserId === s.id}
                onPointerDown={() => void unlockAudio()}
                onClick={() => {
                  setSelectedUserId(s.id);
                  setAuthError(null);
                }}
              >
                {s.displayName}
              </button>
            ))}
          </div>
          <div className="kds-pin" aria-live="polite">
            {pin.replace(/./g, "●") || "••••"}
          </div>
          <div className="kds-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "GO"].map((key) => (
              <button
                key={key}
                type="button"
                onPointerDown={() => void unlockAudio()}
                onClick={() => {
                  if (lockoutLeft > 0) return;
                  if (key === "C") {
                    setPin("");
                    return;
                  }
                  if (key === "GO") {
                    void submitPin();
                    return;
                  }
                  setPin((p) => (p.length >= 8 ? p : p + key));
                }}
              >
                {key === "C" ? "Clear" : key === "GO" ? "Enter" : key}
              </button>
            ))}
          </div>
          {lockoutLeft > 0 ? (
            <p className="kds-lockout">Locked. Try again in {lockoutLeft}s.</p>
          ) : (
            <p className="kds-error">{authError ?? ""}</p>
          )}
        </div>
      </div>
    );
  }

  // Design v1.1 draws the board as ONE auto-filling grid of cards, ordered by age, each card
  // carrying its own next action — not as status columns. The queue, the transitions and the
  // escalation rules are unchanged; only the arrangement is the design's.
  const orders = queue?.orders ?? [];

  const clock = new Date(nowMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="kds-app">
      <div className={degraded ? "kds-offline on" : "kds-offline"}>
        Connection lost · showing the tickets we already have — new orders appear when it&apos;s
        back.
      </div>

      <div className="kds-top">
        <span className="wm">Harold&apos;s — Kitchen</span>
        <span className="net" data-degraded={degraded}>
          <span className="dot" aria-hidden="true" />
          {degraded ? "Offline" : "Connected"}
        </span>
        <span className="health" data-stuck={health.stuck}>
          {health.text}
        </span>
        <span className="who">{staffName}</span>
        <button
          type="button"
          className="kds-topbtn"
          onClick={async () => {
            if (token) {
              try {
                await signOut(token);
              } catch {
                /* still leave locally */
              }
            }
            onAuthFailure();
          }}
        >
          Sign out
        </button>
        <span className="clock">{clock}</span>
      </div>

      <div className="kds-grid">
        {orders.length === 0 ? (
          <p className="kds-empty">Nothing on the board.</p>
        ) : (
          orders.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              nowMs={nowMs}
              screenMs={screenMs}
              soundMs={soundMs}
              isNew={newIds.has(order.id)}
              busy={busyId === order.id}
              onAdvance={() => void advance(order)}
              onCancel={order.status === "READY" ? undefined : () => setCancelId(order.id)}
            />
          ))
        )}
      </div>

      {/* The chime cannot play until the board has been touched once. Until then the board says
          so, in its own words, rather than staying silently broken. */}
      <div className={audioUnlocked ? "kds-unlock" : "kds-unlock on"}>
        <div className="panel">
          <h3>Turn the sound on</h3>
          <p>
            Android needs one tap before the new-order chime can play. This board stays silent
            until then.
          </p>
          <button
            type="button"
            className="kbtn kbtn-ready"
            style={{ maxWidth: 320, margin: "0 auto" }}
            onClick={async () => {
              await unlockAudio();
              setAudioUnlocked(readAudioUnlocked());
            }}
          >
            Enable the chime
          </button>
        </div>
      </div>

      {cancelId ? (
        <div className="kds-confirm">
          <div className="kds-confirm-card">
            <p className="kds-kicker">Cancel order</p>
            <h3 className="kds-title" style={{ fontSize: "var(--display-lg)" }}>
              Cancel this order?
            </h3>
            <p className="kds-sub" style={{ marginBottom: 0 }}>
              This cannot be undone from the kitchen display.
            </p>
            <div className="kds-actions">
              <button type="button" className="kbtn kbtn-picked" onClick={() => setCancelId(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="kbtn kbtn-ready"
                onClick={() => void confirmCancel()}
              >
                Cancel the order
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The action button's shape follows the status, exactly as the design draws the three states. */
function actionClass(status: string): string {
  switch (status) {
    case "IN_PROGRESS":
      return "kbtn kbtn-ready";
    case "READY":
      return "kbtn kbtn-picked";
    default:
      return "kbtn kbtn-start";
  }
}

function Ticket({
  order,
  nowMs,
  screenMs,
  soundMs,
  isNew,
  busy,
  onAdvance,
  onCancel,
}: {
  order: KitchenQueueOrder;
  nowMs: number;
  screenMs: number;
  soundMs: number;
  isNew: boolean;
  busy: boolean;
  onAdvance: () => void;
  onCancel?: () => void;
}) {
  const level = escalationLevel({
    status: order.status,
    paidAt: order.paidAt,
    nowMs,
    screenMs,
    soundMs,
  });
  const action = nextActionLabel(order.status);
  const cls = [
    "kcard",
    isNew ? "kcard--new" : "",
    level === "screen" ? "age-warn" : "",
    level === "sound" ? "age-late" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cls}>
      <span className="agebar" aria-hidden="true" />

      <div className="head">
        <span className="chip">{order.orderNumber ?? "—"}</span>
        <span className="elapsed">{formatElapsed(order.paidAt, nowMs)}</span>
      </div>

      <p className="who">
        {order.customerFirstName} {order.customerLastInitial}.
      </p>

      <div className="lines">
        {order.lines.map((line, i) => (
          <div className="kline" key={`${order.id}-${i}`}>
            <p className="qn">
              <span className="q">{line.quantity}×</span>
              <span>{line.boardLabel || line.itemName}</span>
            </p>
            {line.selectedModifiers.length > 0 ? (
              <ul className="mods">
                <li>
                  {line.selectedModifiers
                    .map((m) => (m.groupName ? `${m.optionName} (${m.groupName})` : m.optionName))
                    .join(" · ")}
                </li>
              </ul>
            ) : null}
            {line.customerNote ? (
              <div className="knote">
                <span className="lb">Item note</span>
                {line.customerNote}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {order.customerNote ? (
        <div className="knote">
          <span className="lb">Customer note</span>
          {order.customerNote}
        </div>
      ) : null}

      {action ? (
        <button
          type="button"
          className={actionClass(order.status)}
          disabled={busy}
          onClick={onAdvance}
        >
          {busy ? "…" : action}
        </button>
      ) : null}

      {onCancel ? (
        <button type="button" className="kbtn kbtn-cancel" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </article>
  );
}
