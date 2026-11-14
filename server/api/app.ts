import { Hono } from "hono";

export const api = new Hono().basePath("/api");

api.get("/health", (c) => c.json({ status: "ok" }));

api.notFound((c) => c.json({ error: "Not found" }, 404));

export type Api = typeof api;
