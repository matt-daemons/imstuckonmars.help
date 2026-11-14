import { api } from "@/server/api/app";

// Hands every /api/* request to the Hono app, which owns API routing.
const handler = (request: Request) => api.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
