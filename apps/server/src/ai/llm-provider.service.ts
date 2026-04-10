import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);
  private readonly baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  private readonly model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

  async *chat(messages: ChatMessage[]): AsyncIterable<ChatChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          yield {
            content: json.message?.content || '',
            done: json.done || false,
          };
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }

  async generateJSON<T>(messages: ChatMessage[]): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: 'json',
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    const data = await response.json();
    return JSON.parse(data.message.content);
  }

  async chatSync(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    const data = await response.json();
    return data.message?.content || '';
  }
}
