'use client';

import dynamic from 'next/dynamic';

// Monaco is browser-only; ssr:false keeps it out of the server bundle.
// Assets load from OUR origin (scripts/copy-monaco.mjs → public/monaco/vs),
// never a third-party CDN — the exam editor must work on restrictive networks.
const MonacoEditor = dynamic(
  async () => {
    const { loader, default: Editor } = await import('@monaco-editor/react');
    loader.config({ paths: { vs: '/monaco/vs' } });
    return Editor;
  },
  { ssr: false },
);

// Our language keys happen to match Monaco's ids for the supported set
// (c, cpp, java, javascript, python, typescript).
export function Editor({
  language,
  value,
  onChange,
}: {
  language: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <MonacoEditor
        height={480}
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
      />
    </div>
  );
}
