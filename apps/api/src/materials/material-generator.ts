import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeneratedMaterial {
  title: string;
  content: string;
  questions: Array<{
    type: 'mcq';
    prompt: string;
    options: string[];
    correct: number[];
    explanation: string;
  }>;
}

/**
 * Claude API wrapper for generating reading material + comprehension
 * questions. Injectable so tests can override it with a stub; when no
 * ANTHROPIC_API_KEY is configured the service layer returns 503 without
 * ever constructing a client.
 */
@Injectable()
export class MaterialGenerator {
  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async generate(topic: string, numQuestions: number): Promise<GeneratedMaterial> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY') });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            `Write a concise reading material (400-700 words, markdown) teaching: ${topic}.`,
            `Then write exactly ${numQuestions} multiple-choice comprehension questions about it.`,
            'Respond with ONLY valid JSON matching:',
            '{"title": string, "content": string(markdown), "questions": [{"type": "mcq", "prompt": string, "options": [4 strings], "correct": [one 0-based index], "explanation": string}]}',
          ].join('\n'),
        },
      ],
    });
    const text = response.content
      .map((block) => ('text' in block && block.type === 'text' ? block.text : ''))
      .join('');
    return JSON.parse(text) as GeneratedMaterial;
  }
}
