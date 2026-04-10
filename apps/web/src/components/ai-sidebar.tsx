'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Layers,
  X,
  Plus,
  Send,
  Sparkles,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Blocks,
  Database,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAiStore } from '@/stores/ai-store';

/* ------------------------------------------------------------------ */
/*  Quick Actions config per page                                      */
/* ------------------------------------------------------------------ */

interface QuickAction {
  labelKey: string;
  icon: typeof Sparkles;
}

const PAGE_ACTIONS: Record<string, QuickAction[]> = {
  apps: [
    { labelKey: 'createApp', icon: Plus },
    { labelKey: 'recommendStructure', icon: Sparkles },
  ],
  'app-detail': [
    { labelKey: 'createModel', icon: Plus },
    { labelKey: 'planRelations', icon: Sparkles },
  ],
  'model-detail': [
    { labelKey: 'suggestFields', icon: Sparkles },
    { labelKey: 'reviewModel', icon: Database },
    { labelKey: 'explainModel', icon: MessageSquare },
  ],
  config: [
    { labelKey: 'explainConfig', icon: Settings },
    { labelKey: 'recommendConfig', icon: Sparkles },
  ],
};

/* ------------------------------------------------------------------ */
/*  ToolCallCard — expandable card for tool execution results          */
/* ------------------------------------------------------------------ */

function ToolCallCard({ toolCalls, t }: {
  toolCalls: Array<{ tool: string; args: unknown; success: boolean; count?: number }>;
  t: ReturnType<typeof useTranslations<'ai'>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = toolCalls.reduce((sum, tc) => sum + (tc.count ?? 1), 0);

  return (
    <div className="mt-2 rounded-md border bg-muted/30 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>{t('toolExecuted', { count: totalCount })}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t">
          {toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                tc.success ? 'bg-green-500' : 'bg-destructive',
              )} />
              <span className="font-mono">{tc.tool}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AiSidebar                                                          */
/* ------------------------------------------------------------------ */

export function AiSidebar() {
  const t = useTranslations('ai');
  const {
    isOpen,
    messages,
    context,
    isStreaming,
    close,
    addUserMessage,
    addAssistantMessage,
    setStreaming,
    clearMessages,
  } = useAiStore();

  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-scroll to bottom when messages change */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [input]);

  /* Focus textarea when panel opens */
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen]);

  /* ---- Send handler ---- */
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    addUserMessage(trimmed);
    setInput('');
    setStreaming(true);

    // Placeholder: simulate AI response (real API in Task 11)
    setTimeout(() => {
      addAssistantMessage({ content: t('aiDisabled') });
      setStreaming(false);
    }, 600);
  }, [input, isStreaming, addUserMessage, addAssistantMessage, setStreaming, t]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ---- Quick action handler ---- */
  const handleQuickAction = useCallback((labelKey: string) => {
    const text = t(labelKey as never);
    addUserMessage(text);
    setStreaming(true);
    setTimeout(() => {
      addAssistantMessage({ content: t('aiDisabled') });
      setStreaming(false);
    }, 600);
  }, [addUserMessage, addAssistantMessage, setStreaming, t]);

  /* ---- Context chips ---- */
  const contextChips: Array<{ label: string; icon: typeof Blocks }> = [];
  if (context.appName) {
    contextChips.push({ label: context.appName, icon: Blocks });
  }
  if (context.modelName) {
    const statusSuffix = context.modelStatus ? ` (${context.modelStatus})` : '';
    contextChips.push({ label: context.modelName + statusSuffix, icon: Database });
  }

  /* ---- Quick actions for current page ---- */
  const quickActions = PAGE_ACTIONS[context.page] || [];

  return (
    <div
      className={cn(
        'fixed top-0 right-0 h-full w-[380px] bg-background border-l shadow-lg z-40 flex flex-col transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground shrink-0">
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{t('title')}</h2>
          {context.appName && (
            <p className="text-xs text-muted-foreground truncate">{t('context')}: {context.appName}</p>
          )}
        </div>
        <button
          onClick={() => { clearMessages(); }}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          title={t('newChat')}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={close}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          title={t('close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ---- Context chips ---- */}
      {contextChips.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b shrink-0 flex-wrap">
          {contextChips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              <chip.icon className="w-3 h-3" />
              {chip.label}
            </span>
          ))}
          {context.fieldCount !== undefined && context.fieldCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {t('fieldsCount', { count: context.fieldCount })}
            </span>
          )}
        </div>
      )}

      {/* ---- Chat messages area ---- */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{t('emptyChat')}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground shrink-0 mt-0.5 mr-2">
                    <Layers className="w-3 h-3" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-muted'
                      : 'border border-primary/20 bg-primary/5',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ToolCallCard toolCalls={msg.toolCalls} t={t} />
                  )}
                </div>
              </div>
            ))
          )}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground shrink-0 mt-0.5 mr-2">
                <Layers className="w-3 h-3" />
              </div>
              <div className="border border-primary/20 bg-primary/5 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                {t('thinking')}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* ---- Quick actions ---- */}
      {quickActions.length > 0 && messages.length === 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-t shrink-0 flex-wrap">
          {quickActions.map((action) => (
            <button
              key={action.labelKey}
              onClick={() => handleQuickAction(action.labelKey)}
              disabled={isStreaming}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted transition-colors disabled:opacity-50"
            >
              <action.icon className="w-3 h-3" />
              {t(action.labelKey as never)}
            </button>
          ))}
        </div>
      )}

      {/* ---- Input area ---- */}
      <div className="px-4 py-3 border-t shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
