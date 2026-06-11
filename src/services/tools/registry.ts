import { ToolDefinition } from './types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the live web and return real-time result titles, snippets, and URLs. Use this for any question about current events, prices, weather, news, or anything that requires up-to-date information. When the snippet is insufficient, call read_url on the most relevant result URL to get the full page content.',
    icon: 'globe',
    requiresNetwork: true,
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'calculator',
    name: 'calculator',
    displayName: 'Calculator',
    description: 'Evaluate math expressions',
    icon: 'hash',
    parameters: {
      expression: {
        type: 'string',
        description: 'Math expression',
        required: true,
      },
    },
  },
  {
    id: 'get_current_datetime',
    name: 'get_current_datetime',
    displayName: 'Date & Time',
    description: 'Get current date and time',
    icon: 'clock',
    parameters: {
      timezone: {
        type: 'string',
        description: 'IANA timezone, e.g. America/New_York',
      },
    },
  },
  {
    id: 'get_device_info',
    name: 'get_device_info',
    displayName: 'Device Info',
    description: 'Get device hardware info',
    icon: 'smartphone',
    parameters: {
      info_type: {
        type: 'string',
        description: 'Info type',
        enum: ['battery', 'storage', 'memory', 'all'],
      },
    },
  },
  {
    id: 'search_knowledge_base',
    name: 'search_knowledge_base',
    displayName: 'Knowledge Base',
    description: 'Search uploaded project documents',
    icon: 'book-open',
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'read_url',
    name: 'read_url',
    displayName: 'URL Reader',
    description: 'Fetch the full live content of any URL. Use this after web_search to read the complete text of a result page, or directly when the user shares a link.',
    icon: 'link',
    requiresNetwork: true,
    parameters: {
      url: {
        type: 'string',
        description: 'Full URL to fetch',
        required: true,
      },
    },
  },
  {
    id: 'send_email',
    name: 'send_email',
    displayName: 'Send Email',
    description: 'Open the default mail app to send an email',
    icon: 'mail',
    parameters: {
      to: {
        type: 'string',
        description: 'Recipient email address',
        required: true,
      },
      subject: {
        type: 'string',
        description: 'Email subject',
      },
      body: {
        type: 'string',
        description: 'Email body',
      },
    },
  },
  {
    id: 'create_calendar_event',
    name: 'create_calendar_event',
    displayName: 'Create Calendar Event',
    description: 'Create an event in the device calendar',
    icon: 'calendar',
    parameters: {
      title: {
        type: 'string',
        description: 'Event title',
        required: true,
      },
      start_date: {
        type: 'string',
        description: 'Start date/time in ISO 8601 format, e.g. 2025-06-01T10:00:00',
        required: true,
      },
      end_date: {
        type: 'string',
        description: 'End date/time in ISO 8601 format',
        required: true,
      },
      location: {
        type: 'string',
        description: 'Event location',
      },
      notes: {
        type: 'string',
        description: 'Additional notes for the event',
      },
    },
  },
  {
    id: 'read_calendar_events',
    name: 'read_calendar_events',
    displayName: 'Read Calendar Events',
    description: 'Read upcoming events from the device calendar',
    icon: 'calendar',
    parameters: {
      start_date: {
        type: 'string',
        description: 'Start of date range in ISO 8601 format. Defaults to today.',
      },
      end_date: {
        type: 'string',
        description: 'End of date range in ISO 8601 format. Defaults to 7 days from start.',
      },
    },
  },
];

export function getToolsAsOpenAISchema(enabledToolIds: string[]) {
  return AVAILABLE_TOOLS
    .filter(tool => enabledToolIds.includes(tool.id))
    .map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ]),
          ),
          required: Object.entries(tool.parameters)
            .filter(([_, param]) => param.required)
            .map(([key]) => key),
        },
      },
    }));
}

export function buildToolSystemPromptHint(enabledToolIds: string[]): string {
  const enabledTools = AVAILABLE_TOOLS.filter(t => enabledToolIds.includes(t.id));
  if (enabledTools.length === 0) return '';

  const toolList = enabledTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `\n\nTools available:\n${toolList}\nUse these tools proactively and precisely — call the right tool at the right moment rather than guessing or saying you cannot help.`;
}
