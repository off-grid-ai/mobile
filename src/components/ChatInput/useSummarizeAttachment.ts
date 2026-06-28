import { useState } from 'react';
import { MediaAttachment } from '../../types';
import { transcriptSummarizer, type SummarizeProgress } from '../../services';
import { useChatStore, useAppStore } from '../../stores';
import logger from '../../utils/logger';

/** mm:ss for a millisecond offset, used to label an attached transcript range. */
function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Human-readable line for each summarization phase, streamed into the message. */
function progressLabel(p: SummarizeProgress): string {
  switch (p.phase) {
    case 'chunking':
      return `Reading the transcript in ${p.total} parts...`;
    case 'mapping':
      return `Summarizing part ${p.current} of ${p.total}...`;
    case 'reducing':
      return `Combining the parts (pass ${p.round})...`;
    default:
      return 'Working...';
  }
}

/**
 * Summarize an attached document/transcript that is too large to fit the model's
 * context window. Posts a user message ("Summarize <file>") and an assistant
 * message, then streams progress into that assistant message (part i of N,
 * combining) before replacing it with the final summary. Self-contained: reads
 * the active conversation + model from the global stores, so it does not need
 * props threaded down from the chat screen.
 */
export function useSummarizeAttachment() {
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  const handleSummarize = async (attachment: MediaAttachment): Promise<void> => {
    if (summarizingId) return;
    const text = attachment.textContent?.trim();
    if (!text) return;

    const chat = useChatStore.getState();
    let conversationId = chat.activeConversationId;
    if (!conversationId) {
      const modelId = useAppStore.getState().activeModelId;
      if (!modelId) return; // no model loaded - nothing to summarize with
      conversationId = chat.createConversation(modelId);
      chat.setActiveConversation(conversationId);
    }

    const label = attachment.fileName || 'transcript';
    const range =
      attachment.transcriptStartMs != null && attachment.transcriptEndMs != null
        ? ` (${fmtClock(attachment.transcriptStartMs)} to ${fmtClock(attachment.transcriptEndMs)})`
        : '';
    chat.addMessage(conversationId, { role: 'user', content: `Summarize ${label}${range}` });
    const placeholder = chat.addMessage(conversationId, { role: 'assistant', content: 'Starting...' });

    setSummarizingId(attachment.id);
    try {
      const summary = await transcriptSummarizer.summarize(text, {
        onProgress: (p) => {
          if (p.phase !== 'done' && p.phase !== 'error') {
            useChatStore.getState().updateMessageContent(conversationId!, placeholder.id, progressLabel(p));
          }
        },
      });
      useChatStore.getState().updateMessageContent(conversationId, placeholder.id, summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Summarization failed';
      useChatStore.getState().updateMessageContent(
        conversationId,
        placeholder.id,
        `Could not summarize this transcript.\n\n${msg}`,
      );
      logger.warn('[useSummarizeAttachment] failed:', e);
    } finally {
      setSummarizingId(null);
    }
  };

  return { summarizingId, handleSummarize };
}
