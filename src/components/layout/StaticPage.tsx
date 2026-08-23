import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { ProjectLogo } from '../brand/ProjectLogo'
import { cn } from '../../lib/cn'

/**
 * The frame shared by every page that sits outside the app itself — privacy, terms, get-app, and
 * whatever static page comes next. One shell means the header, title block and footer links can't
 * drift apart between them, and a new page gets the narrow-width behaviour for free.
 *
 * That behaviour is the point of the layout choices here: the back-link is the only thing in the
 * header that must be there, so it's the only thing there on a phone (the cross-links appear from
 * `sm` up, and the footer carries the same set at every width). The revision date sits under the
 * title rather than in the header's right corner — in the corner it fought the wordmark for room
 * below ~360px, and under the title it reads as part of the document, which is what it is.
 */
export interface StaticPageProps {
  title: string
  /** A revision line under the title. The legal documents carry one; other pages don't. */
  updated?: string
  /** `wide` for pages laying out things rather than prose. */
  width?: 'prose' | 'wide'
  children: ReactNode
}

export function StaticPage({ title, updated, width = 'prose', children }: StaticPageProps) {
  const container = width === 'wide' ? 'max-w-3xl' : 'max-w-2xl'

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-xl">
        <div className={cn('mx-auto flex items-center gap-2 px-4 py-3 sm:px-6', container)}>
          {/* Below 360px the wordmark drops and the mark stands in for it — a clipped brand name
              reads as breakage, an icon-only back-link doesn't. */}
          <Link
            to="/welcome"
            className="anim-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ProjectLogo className="h-3.5 w-[19px] text-[var(--color-accent)]" />
            <span className="hidden whitespace-nowrap min-[360px]:inline">Mindstack</span>
          </Link>
          <nav className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
            <HeaderLink to="/privacy">Privacy</HeaderLink>
            <HeaderLink to="/terms">Terms</HeaderLink>
          </nav>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-10 sm:px-6 sm:py-14', container)}>
        <h1
          className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        {updated ? (
          <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">Updated {updated}</p>
        ) : null}

        <div className="mt-6">{children}</div>

        <nav className="mt-10 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-[var(--color-border)] pt-5 text-[13px] text-[var(--color-text-muted)]">
          <FooterLink to="/privacy">Privacy</FooterLink>
          <Dot />
          <FooterLink to="/terms">Terms</FooterLink>
          <Dot />
          <FooterLink to="/get-app">Get app</FooterLink>
          <Dot />
          <FooterLink to="/welcome">Home</FooterLink>
        </nav>
      </main>
    </div>
  )
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="anim-press whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
    >
      {children}
    </Link>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="whitespace-nowrap hover:text-[var(--color-text)] hover:underline">
      {children}
    </Link>
  )
}

function Dot() {
  return <span aria-hidden>·</span>
}

/* The prose primitives live here too, so a static page written next month picks up the same
   measure, rhythm and link colour as the ones written today. They keep their one-letter names at
   the call site — the documents that use them are almost entirely made of them. */

export function DocH({ children }: { children: ReactNode }) {
  return (
    <h2
      className="mt-8 text-[17px] font-semibold tracking-tight"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}

export function DocP({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-text-muted)]">{children}</p>
}

export function DocUL({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2">{children}</ul>
}

export function DocLI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-4 text-[14.5px] leading-relaxed text-[var(--color-text-muted)]">
      <span className="absolute left-0 top-[0.6em] h-1 w-1 rounded-full bg-[var(--color-accent)]" aria-hidden />
      {children}
    </li>
  )
}

export function DocB({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[var(--color-text)]">{children}</strong>
}

export function DocA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-[var(--color-accent)] hover:underline">
      {children}
    </a>
  )
}
