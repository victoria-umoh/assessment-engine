import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Providers } from '@/lib/query';

describe('Providers', () => {
  it('renders children inside the query client provider', () => {
    render(
      <Providers>
        <p>ok</p>
      </Providers>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
