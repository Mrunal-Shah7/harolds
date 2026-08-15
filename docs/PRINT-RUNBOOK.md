# Tickets stopped printing — store runbook

Keep this near the printer. You do not need a computer person for the first checks.

## 1. Look at the printer

- Is it **on**? Green light?
- Is there **paper**? If the light is flashing and nothing comes out, open the cover and load a roll. Close the cover firmly.
- Is the **cover latched**? An open cover will not print.
- Is the network cable / Wi-Fi light on?

If you fixed paper or the cover, **wait about 30 seconds**. The next tickets in line should start coming out. Do not ring the order again.

## 2. Printer vs system

**Probably the printer** if: no tickets at all, lights flashing, cover open, or it has been unplugged.

**Probably the system** if: the printer is on, has paper, cover closed, and still nothing after a minute — or only some orders print.

A printer that has gone quiet for **two minutes** during open hours is treated as off. Call support (below) rather than taking money twice.

## 3. Reprint an order

Do **not** cook from a reprint unless the kitchen never got the first ticket.

Ask a manager to reprint from `/admin` on the order (Reprint kitchen / Reprint counter). A reprinted ticket is marked **REPRINT** at the top so it is not a second order. The time on the ticket is the original time, not now.

## 4. Who to call

1. Manager on duty.
2. The person who set up the online ordering (they have the server and the printer login).
3. Do not call Square for a missing kitchen ticket — payment already happened. The order is still paid even if the paper never came out. Check the kitchen screen (when it is installed) for the same order.

## 5. What not to do

- Do not take payment again.
- Do not turn the printer off and on repeatedly during a rush unless it is frozen.
- Do not change the printer’s web settings unless you were walked through them. The print address must stay the HTTPS address with the secret on the end.

## 6. The secret in the printer URL (Sprint 9)

The printer cannot send Digest auth reliably, so the shared secret sits in the URL as `?key=…`. That secret will appear in any proxy access log that records query strings.

On the server, nginx must omit the query string for `/api/v1/print/poll` and `/api/v1/print/complete` only. Example:

```
location /api/v1/print/ {
    access_log /var/log/nginx/print.access.log combined_no_query;
}
log_format combined_no_query '$remote_addr - $remote_user [$time_local] '
    '"$request_method $uri $server_protocol" $status $body_bytes_sent';
```

Rotating the secret means changing it on the printer’s Server Direct Print page and in the server `.env` (`PRINTER_SDP_SHARED_SECRET`) in the same window. An invalid secret returns 401 and does not say whether the serial is known. Residual risk: anyone who can read a raw access log from before the nginx change, or the printer’s own configuration page, still has the secret.

