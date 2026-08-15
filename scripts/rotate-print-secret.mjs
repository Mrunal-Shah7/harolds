#!/usr/bin/env node
// SPRINT-9: generate a long random print shared secret for rotation.
import { randomBytes } from "node:crypto";

const secret = randomBytes(32).toString("base64url");
console.log(secret);
console.log("Set PRINTER_SDP_SHARED_SECRET to the line above and the printer Server Direct Print password/URL key to the same value in the same window.");
