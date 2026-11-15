import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import * as zod from "zod";
import { MissionError } from "../../lib/mission/types";
import {
  DEFAULT_SCENARIO,
  DEMO_SCENARIO_IDS,
  DEMO_SCENARIOS,
  demoMissionConfig,
  prepareDemoMission,
} from "../copilot/demo-mission";
import { laraContextSchema, readLaraContext } from "../../lib/copilot/lara-context";
import { trainingNote } from "../../lib/copilot/training";
import { askCopilot } from "../copilot/llm";
import { answerDestinationRequest } from "../copilot/destination-request";
import { answerMapRequest, verifyMapActionText } from "../copilot/map-request";
import { laraToolbox } from "../copilot/toolbox";
import { copilotTools } from "../copilot/tools";
import { createSession, sessionFor } from "../mission/service";
import { scenarioPresets } from "../db/schema";
import { database, type ApiBindings } from "./bindings";
import { readTimedSpeech } from "../copilot/timed-speech";

export const DEFAULT_VOICE_ID = "5u41aNhyCU6hXOcjPPv0";
/** Low stability and high style keep LARA's delivery lively on the low-latency Flash model. */
export const VOICE = {
  model_id: "eleven_flash_v2_5",
  voice_settings: {
    stability: 0.2,
    similarity_boost: 0.75,
    style: 0.6,
    use_speaker_boost: true,
    speed: 1.08,
  },
};
const ELEVENLABS = "https://api.elevenlabs.io/v1";
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** The longest answer that /ask returns, plus a follow-up prompt and its pause. */
const MAX_SPOKEN_CHARS = 1600;

const askSchema = zod
  .object({
    question: zod.string().trim().min(1).max(2000).optional(),
    alert: zod
      .object({ code: zod.string().max(120), detail: zod.string().max(500).optional() })
      .optional(),
    history: zod
      .array(
        zod.object({
          role: zod.enum(["user", "assistant"]),
          content: zod.string().max(2000),
        }),
      )
      .max(12)
      .default([]),
    context: laraContextSchema.optional(),
  })
  .refine((body) => Boolean(body.question) !== Boolean(body.alert), {
    message: "Send exactly one field: question or alert",
  });

const speakSchema = zod.object({
  text: zod.string().trim().min(1).max(MAX_SPOKEN_CHARS),
  timestamps: zod.boolean().default(false),
});

const sessionSchema = zod.object({
  scenario: zod.enum(DEMO_SCENARIO_IDS).default(DEFAULT_SCENARIO),
});

function parse<T>(schema: zod.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new MissionError(
      "invalid_input",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  return result.data;
}

function elevenLabsKey(env: ApiBindings) {
  if (!env.ELEVENLABS_API_KEY)
    throw new MissionError(
      "voice_not_configured",
      "Voice is not configured. Set ELEVENLABS_API_KEY on the server",
      503,
    );
  return env.ELEVENLABS_API_KEY;
}

export const copilot = new Hono<{ Bindings: ApiBindings }>();

/**
 * Creates a demo mission from the release's illustrative preset with the server-side creation key and
 * returns that mission's capability token. The creation key never leaves the server.
 */
copilot.post("/session", async (c) => {
  if (!c.env.MISSION_WRITE_KEY)
    throw new MissionError(
      "access_not_configured",
      "Mission access is not configured. Set MISSION_WRITE_KEY on the server",
      503,
    );
  const db = database(c.env);
  const release = c.env.TELEMETRY_RELEASE ?? "nasa-v1";
  const preset = await db
    .select({ config_json: scenarioPresets.config_json })
    .from(scenarioPresets)
    .where(eq(scenarioPresets.id, `${release}-illustrative`))
    .get();
  if (!preset)
    throw new MissionError(
      "preset_not_found",
      `No illustrative preset exists for release ${release}`,
      503,
    );
  const { scenario } = parse(sessionSchema, await c.req.json<unknown>().catch(() => ({})));
  const result = await createSession(
    db,
    release,
    demoMissionConfig(JSON.parse(preset.config_json)),
  );
  await prepareDemoMission(db, result, DEMO_SCENARIOS[scenario]);
  return c.json(
    {
      ...result,
      scenario,
      scenario_title: DEMO_SCENARIOS[scenario].title,
    },
    201,
  );
});

copilot.post("/:id/ask", async (c) => {
  const db = database(c.env);
  const session = await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const body = parse(askSchema, await c.req.json<unknown>());
  const tools = await copilotTools(db, session, c.env.RADIATION_RELEASE);
  const context = readLaraContext(body.context);
  const toolbox = laraToolbox(tools.run, context);
  const prompt = body.alert
    ? `[Automatic alert from the mission monitor. This is not a question from the crew.] ${body.alert.code}${body.alert.detail ? `: ${body.alert.detail}` : ""}. Call the tools that apply to this alert. Then tell the crew about the alert in one or two sentences. Include the most important number.`
    : (body.question as string);
  const directAnswer = body.question
    ? (answerMapRequest(body.question, context) ?? answerDestinationRequest(body.question, context))
    : null;
  const answer =
    directAnswer ??
    (await askCopilot({
      key: c.env.DIAGNOSTICS_API_KEY,
      model: c.env.DIAGNOSTICS_MODEL,
      prompt,
      history: body.history,
      note: context.training.status === "present" ? trainingNote(context.training.value) : null,
      run: toolbox.run,
    }));
  const actions = directAnswer?.actions ?? toolbox.actions;
  return c.json({
    ...answer,
    text: verifyMapActionText(answer.text, actions),
    actions,
    mission_id: session.id,
    revision: session.revision,
    evaluated_at_s: tools.snapshot.state.elapsed_s,
    warning:
      "AI-generated. Resources are simulated and observations are proxies. This is not a safety assessment.",
  });
});

copilot.post("/:id/speak", async (c) => {
  const db = database(c.env);
  await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const { text, timestamps } = parse(speakSchema, await c.req.json<unknown>());
  const voice = c.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const upstream = await fetch(
    `${ELEVENLABS}/text-to-speech/${voice}/${timestamps ? "with-timestamps" : "stream"}?output_format=mp3_44100_128`,
    {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "xi-api-key": elevenLabsKey(c.env), "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...VOICE }),
    },
  );
  if (!upstream.ok || !upstream.body)
    throw new MissionError("voice_unavailable", `Text to speech failed (${upstream.status})`, 503);
  if (timestamps) {
    try {
      return c.json(await readTimedSpeech(upstream));
    } catch {
      throw new MissionError(
        "voice_unavailable",
        "Speech timing is unavailable. Retry the response.",
        503,
      );
    }
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});

copilot.post("/:id/transcribe", bodyLimit({ maxSize: MAX_AUDIO_BYTES }), async (c) => {
  const db = database(c.env);
  await sessionFor(db, c.req.param("id"), c.req.header("Authorization"));
  const type = c.req.header("Content-Type") ?? "";
  if (!type.startsWith("audio/"))
    throw new MissionError("invalid_input", "Send raw audio with an audio/* Content-Type", 400);
  const audio = await c.req.arrayBuffer();
  if (audio.byteLength === 0) throw new MissionError("invalid_input", "The audio is empty", 400);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("file", new Blob([audio], { type }), "speech.webm");
  const upstream = await fetch(`${ELEVENLABS}/speech-to-text`, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: { "xi-api-key": elevenLabsKey(c.env) },
    body: form,
  });
  if (!upstream.ok)
    throw new MissionError("voice_unavailable", `Speech to text failed (${upstream.status})`, 503);
  const result = (await upstream.json()) as { text?: string };
  return c.json({ text: (result.text ?? "").trim() });
});
