/**
 * LiteRT two-pass tool selection.
 *
 * When many tools are enabled, a small on-device model can't fit every schema in
 * context, so the first pass is a fast, tools-free routing step: "here is the
 * request and a name:description catalog — which tools are needed?" The selected
 * names then drive a much smaller tool set for the real generation pass.
 *
 * LiteRT only — its fast inference makes the extra pass cheap. The routing pass
 * runs on a throwaway native session (see liteRTService.generateToolSelection),
 * so it never enters chat or the real conversation's context.
 */
import { liteRTService } from './litert';
import logger from '../utils/logger';

const TAG = '[LiteRTToolSelect]';

const ROUTER_SYSTEM =
  'You are a tool router. From the tool list, reply with ONLY the exact names of ' +
  'the tools needed to answer the user request, comma-separated. Reply "none" if ' +
  'no tool is needed. Do not call any tools. Do not explain.';

interface OpenAITool {
  function: { name: string; description?: string };
}

function firstLine(desc: string | undefined, max = 100): string {
  const line = (desc ?? '').split('\n')[0].trim();
  return line.length > max ? line.slice(0, max) : line;
}

/**
 * Ask the model which of `tools` are relevant to `userText`. Returns the matching
 * tool names. Lenient by design — small models format the list inconsistently, so
 * we keep any known tool name that appears in the reply rather than parsing strict
 * commas. Returns [] when nothing matches (callers fall back to all tools).
 */
export async function selectLiteRTTools(userText: string, tools: OpenAITool[]): Promise<string[]> {
  if (tools.length === 0 || !userText.trim()) return [];

  const catalog = tools.map(t => `- ${t.function.name}: ${firstLine(t.function.description)}`).join('\n');
  const prompt = `User request:\n${userText}\n\nTools:\n${catalog}`;

  const raw = (await liteRTService.generateToolSelection(ROUTER_SYSTEM, prompt)).toLowerCase();
  const selected = tools
    .map(t => t.function.name)
    .filter(name => raw.includes(name.toLowerCase()));

  logger.log(`${TAG} selected ${selected.length}/${tools.length}: [${selected.join(', ')}]`);
  return selected;
}
