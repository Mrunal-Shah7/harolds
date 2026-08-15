"use client";

// SPRINT-9: browser error reporter — posts a short message, never tokens or PII.
import { useEffect } from "react";

export function ClientErrorReporter() {
  useEffect(() => {
    const send = (message: string, source: string) => {
      void fetch("/api/internal/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.slice(0, 500), source }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => {
      send(event.message || "window.error", "window");
    };
    const onRejected = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "unhandledrejection");
      send(reason, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejected);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejected);
    };
  }, []);
  return null;
}
