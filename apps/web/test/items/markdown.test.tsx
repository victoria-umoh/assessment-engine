import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from '@/components/items/markdown';

describe('Markdown', () => {
  it('renders gfm tables but never injects raw HTML (spec §7)', () => {
    const { container } = render(
      <Markdown>{'| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>'}</Markdown>,
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
