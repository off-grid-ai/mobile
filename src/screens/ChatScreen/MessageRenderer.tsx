import React from 'react';
import { ChatMessage } from '../../components';
import { AudioMessageBubble } from '../../components/AudioMessageBubble';
import { TTSButton } from '../../components/TTSButton';
import { AnimatedEntry } from '../../components/AnimatedEntry';
import { useTTSStore } from '../../stores/ttsStore';
import { stripControlTokens } from '../../utils/messageContent';
import { Message } from '../../types';
import '../../types/tts';
import { ChatMessageItem } from './useChatScreen';

type MessageRendererProps = {
  item: Message | ChatMessageItem;
  index: number;
  displayMessagesLength: number;
  animateLastN: number;
  imageModelLoaded: boolean;
  isStreaming: boolean;
  isGeneratingImage: boolean;
  showGenerationDetails: boolean;
  onCopy: (content: string) => void;
  onRetry: (message: Message) => void;
  onEdit: (message: Message, newContent: string) => void;
  onGenerateImage: (prompt: string) => void;
  onImagePress: (uri: string) => void;
};

type AudioBubbleProps = {
  messageId: string;
  audioPath: string;
  waveformData: number[];
  durationSeconds: number;
  transcript: string;
  isGenerating: boolean;
};

function buildAudioBubbleProps(msg: Message): AudioBubbleProps {
  return {
    messageId: msg.id,
    audioPath: msg.audioPath ?? '',
    waveformData: msg.waveformData ?? [],
    durationSeconds: msg.audioDurationSeconds ?? 0,
    transcript: stripControlTokens(msg.content),
    isGenerating: Boolean(msg.isGeneratingAudio),
  };
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  item,
  index,
  displayMessagesLength,
  animateLastN,
  imageModelLoaded,
  isStreaming,
  isGeneratingImage,
  showGenerationDetails,
  onCopy,
  onRetry,
  onEdit,
  onGenerateImage,
  onImagePress,
}) => {
  const ttsMode = useTTSStore((s) => s.settings.interfaceMode);
  const msg = item as Message;
  const animateEntry = animateLastN > 0 && index >= displayMessagesLength - animateLastN;
  const isStreamingThis = item.id === 'streaming';

  // Audio Mode: plain assistant messages render as waveform bubbles
  if (msg.role === 'assistant' && ttsMode === 'audio' && !msg.isSystemInfo && !msg.toolCalls?.length) {
    const bubble = <AudioMessageBubble {...buildAudioBubbleProps(msg)} />;
    return animateEntry ? <AnimatedEntry index={0}>{bubble}</AnimatedEntry> : bubble;
  }

  // Chat Mode: TTSButton lives in the meta row via metaExtra prop
  const isPlainAssistant = msg.role === 'assistant' && !msg.isSystemInfo && !msg.toolCalls?.length;
  const ttsMeta = isPlainAssistant && !isStreamingThis
    ? <TTSButton text={stripControlTokens(msg.content)} messageId={msg.id} />
    : undefined;

  return (
    <ChatMessage
      message={msg}
      isStreaming={isStreamingThis}
      onCopy={onCopy}
      onRetry={onRetry}
      onEdit={onEdit}
      onGenerateImage={onGenerateImage}
      onImagePress={onImagePress}
      canGenerateImage={imageModelLoaded && !isStreaming && !isGeneratingImage}
      showGenerationDetails={showGenerationDetails}
      animateEntry={animateEntry}
      metaExtra={ttsMeta}
    />
  );
};
