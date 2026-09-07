import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./lib/errors.js";
import { adminRouter } from "./routes/admin.js";
import { walletsRouter } from "./routes/wallets.js";

export const app = new Hono();

// Allow cross-origin requests from the frontend (Vite dev server etc.).
// Dev defaults to `*`; restrict `origin` for production.
app.use("*", cors());

app.get("/", (c) =>
  c.json({ name: "Credit Reputation Protocol API", status: "ok" }),
);
app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/wallets", walletsRouter);
app.route("/api/admin", adminRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError(errorHandler);
