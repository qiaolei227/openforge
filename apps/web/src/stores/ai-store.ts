import { create } from 'zustand';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; args: unknown; success: boolean; count?: number }>;
  timestamp: number;
}

interface AiContext {
  page: string;
  appId?: string;
  appName?: string;
  modelId?: string;
  modelName?: string;
  modelStatus?: string;
  fieldCount?: number;
}

interface AiState {
  isOpen: boolean;
  messages: ChatMessage[];
  context: AiContext;
  isStreaming: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setContext: (ctx: AiContext) => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (msg: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>) => void;
  appendToLastAssistant: (content: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

const AI_OPEN_KEY = 'openforge_ai_open';

export const useAiStore = create<AiState>((set) => ({
  isOpen: false,
  messages: [],
  context: { page: 'dashboard' },
  isStreaming: false,

  toggle: () =>
    set((s) => {
      const next = !s.isOpen;
      if (typeof window !== 'undefined') localStorage.setItem(AI_OPEN_KEY, String(next));
      return { isOpen: next };
    }),

  open: () => {
    if (typeof window !== 'undefined') localStorage.setItem(AI_OPEN_KEY, 'true');
    set({ isOpen: true });
  },

  close: () => {
    if (typeof window !== 'undefined') localStorage.setItem(AI_OPEN_KEY, 'false');
    set({ isOpen: false });
  },

  setContext: (context) => set({ context }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() },
      ],
    })),

  addAssistantMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'assistant', timestamp: Date.now(), ...msg },
      ],
    })),

  appendToLastAssistant: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      }
      return { messages: msgs };
    }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearMessages: () => set({ messages: [] }),
}));
