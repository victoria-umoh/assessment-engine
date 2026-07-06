'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// No rehype-raw: raw HTML in content or extracted upload text stays text
// (spec §7 — extracted text sanitized before rendering).
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-neutral max-w-none dark:prose-invert [&_table]:w-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
