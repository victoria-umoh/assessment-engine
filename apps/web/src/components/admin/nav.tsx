'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tracks', label: 'Tracks' },
  { href: '/admin/cohorts', label: 'Cohorts' },
  { href: '/admin/questions', label: 'Questions' },
  { href: '/admin/coding', label: 'Coding' },
  { href: '/admin/lessons', label: 'Lessons' },
  { href: '/admin/materials', label: 'Materials' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/audit', label: 'Audit' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-2 text-sm hover:bg-accent',
            isActive(pathname, href) && 'bg-accent font-medium',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
