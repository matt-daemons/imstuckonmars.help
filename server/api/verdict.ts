import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { evaluateEva, evaPlanSchema } from "@/lib/flight-rules/evaluate";

export const verdict = new Hono();

/** Checks a planned walk against the flight rules in lib/flight-rules/rules.ts. */
verdict.post("/", async (context) => {
  const parsedPlan = evaPlanSchema.safeParse(await context.req.json<unknown>());
  if (!parsedPlan.success) {
    const problems = parsedPlan.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new HTTPException(400, { message: problems.join("; ") });
  }
  return context.json(evaluateEva(parsedPlan.data));
});
