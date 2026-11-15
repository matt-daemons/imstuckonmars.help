import type { LaraContext } from "../../lib/copilot/lara-context";
import {
  CONTEXT_TOOL_DEFINITIONS,
  CONTEXT_TOOL_NAMES,
  contextTools,
  type ContextTool,
} from "./context-tools";
import { TOOL_DEFINITIONS, TOOL_NAMES, type CopilotTool } from "./tools";
import {
  UI_ACTION_DEFINITIONS,
  UI_ACTION_NAMES,
  uiActionRecorder,
  type UiActionTool,
} from "./ui-actions";

/** Every tool LARA can call: mission data, what the browser reports, and app actions. */
export type LaraTool = CopilotTool | ContextTool | UiActionTool;

export const LARA_TOOL_DEFINITIONS = [
  ...TOOL_DEFINITIONS,
  ...CONTEXT_TOOL_DEFINITIONS,
  ...UI_ACTION_DEFINITIONS,
];

export const LARA_TOOL_NAMES: LaraTool[] = [
  ...TOOL_NAMES,
  ...CONTEXT_TOOL_NAMES,
  ...UI_ACTION_NAMES,
];

const isContextTool = (name: LaraTool): name is ContextTool =>
  (CONTEXT_TOOL_NAMES as LaraTool[]).includes(name);
const isUiAction = (name: LaraTool): name is UiActionTool =>
  (UI_ACTION_NAMES as LaraTool[]).includes(name);

/**
 * One question's tools: mission tools run on the server, context tools read what the browser sent,
 * and app actions are only recorded, for the browser to run after the answer.
 */
export function laraToolbox(
  runMissionTool: (name: CopilotTool, args: unknown) => Promise<unknown>,
  context: LaraContext,
) {
  const recorder = uiActionRecorder(context);
  const readContext = contextTools(context);
  const run = async (name: LaraTool, args: unknown): Promise<unknown> => {
    if (isUiAction(name)) return recorder.record(name, args);
    if (isContextTool(name)) return readContext(name, args);
    return runMissionTool(name, args);
  };
  return { run, actions: recorder.actions };
}
