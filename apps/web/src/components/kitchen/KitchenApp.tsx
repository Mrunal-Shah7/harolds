// SPRINT-6: kitchen display PWA — PIN pad, order board, poll, alerts, offline retain.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
        <p className="kds-kicker">Harold&apos;s Oak Lawn</p>
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
                data-selected={selectedUserId === s.id}
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

  const start = queue?.orders.filter((o) => o.status === "PAID" || o.status === "PRINTED") ?? [];
  const cooking = queue?.orders.filter((o) => o.status === "IN_PROGRESS") ?? [];
  const ready = queue?.orders.filter((o) => o.status === "READY") ?? [];

  return (
    <div className="kds-app">
      {degraded ? <div className="kds-stale-banner">Connection lost — showing last tickets</div> : null}
      <header className="kds-header">
        <div className="kds-brand">Expo</div>
        <div className="kds-health" data-stuck={health.stuck}>
          {health.text}
        </div>
        <div className="kds-conn" data-degraded={degraded}>
          {degraded ? "DEGRADED" : "LIVE"}
        </div>
        <div className="kds-who">{staffName}</div>
        <button
          type="button"
          className="kds-btn"
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
      </header>
      <div className="kds-board">
        <Column title="Start" orders={start} empty="Nothing waiting">
          {(order) => (
            <Ticket
              key={order.id}
              order={order}
              nowMs={nowMs}
              screenMs={screenMs}
              soundMs={soundMs}
              isNew={newIds.has(order.id)}
              busy={busyId === order.id}
              onAdvance={() => void advance(order)}
              onCancel={() => setCancelId(order.id)}
            />
          )}
        </Column>
        <Column title="Cooking" orders={cooking} empty="Nothing on the board">
          {(order) => (
            <Ticket
              key={order.id}
              order={order}
              nowMs={nowMs}
              screenMs={screenMs}
              soundMs={soundMs}
              isNew={newIds.has(order.id)}
              busy={busyId === order.id}
              onAdvance={() => void advance(order)}
              onCancel={() => setCancelId(order.id)}
            />
          )}
        </Column>
        <Column title="Pickup" orders={ready} empty="No bags waiting">
          {(order) => (
            <Ticket
              key={order.id}
              order={order}
              nowMs={nowMs}
              screenMs={screenMs}
              soundMs={soundMs}
              isNew={newIds.has(order.id)}
              busy={busyId === order.id}
              onAdvance={() => void advance(order)}
            />
          )}
        </Column>
      </div>
      {cancelId ? (
        <div className="kds-confirm">
          <div className="kds-confirm-card">
            <p className="kds-kicker">Cancel order</p>
            <p className="kds-sub">This cannot be undone from the kitchen display.</p>
            <div className="kds-actions">
              <button type="button" className="kds-go" onClick={() => void confirmCancel()}>
                Cancel order
              </button>
              <button type="button" className="kds-cancel" onClick={() => setCancelId(null)}>
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Column({
  title,
  orders,
  empty,
  children,
}: {
  title: string;
  orders: KitchenQueueOrder[];
  empty: string;
  children: (order: KitchenQueueOrder) => ReactNode;
}) {
  return (
    <section className="kds-col">
      <h2>
        {title} · {orders.length}
      </h2>
      {orders.length === 0 ? <p className="kds-empty">{empty}</p> : orders.map(children)}
    </section>
  );
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
    "kds-card",
    isNew ? "kds-card--new" : "",
    level === "screen" ? "kds-card--screen" : "",
    level === "sound" ? "kds-card--sound" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cls}>
      <div className="kds-card-top">
        <div className="kds-num">{order.orderNumber ?? "—"}</div>
        <div className="kds-elapsed">{formatElapsed(order.paidAt, nowMs)}</div>
      </div>
      <div className="kds-name">
        {order.customerFirstName} {order.customerLastInitial}.
      </div>
      {order.lines.map((line, i) => (
        <div key={`${order.id}-${i}`}>
          <p className="kds-line">
            {line.quantity} × {line.boardLabel || line.itemName}
          </p>
          {line.selectedModifiers.length > 0 ? (
            <ul className="kds-mods">
              {line.selectedModifiers.map((m) => (
                <li key={`${m.groupName}-${m.optionName}`}>
                  {m.optionName}
                  {m.groupName ? ` (${m.groupName})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {line.customerNote ? <p className="kds-note">NOTE: {line.customerNote}</p> : null}
        </div>
      ))}
      {order.customerNote ? <p className="kds-note">ORDER: {order.customerNote}</p> : null}
      <div className="kds-actions">
        {action ? (
          <button type="button" className="kds-go" disabled={busy} onClick={onAdvance}>
            {busy ? "…" : action}
          </button>
        ) : (
          <span />
        )}
        {onCancel ? (
          <button type="button" className="kds-cancel" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </article>
  );
}
