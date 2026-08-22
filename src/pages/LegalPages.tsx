import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { ProjectLogo } from '../components/brand/ProjectLogo'

/**
 * Both documents describe only what the app and its Supabase project actually do today — the
 * data it stores, where it stores it, what leaves it, and what it doesn't have (no analytics,
 * no sharing, no backups, no in-app account deletion). If a behaviour changes, these change with
 * it; nothing here is boilerplate copied from a template.
 */
const CONTACT_EMAIL = 'shirsathyash666@gmail.com'
const LAST_UPDATED = '23 August 2026'

export function PrivacyPage() {
  return (
    <LegalScreen title="Privacy" updated={LAST_UPDATED}>
      <P>
        Mindstack is a personal note-taking app run by one person. This page describes exactly what it
        stores, where it lives, and who can see it.
      </P>

      <H>What&rsquo;s stored about you</H>
      <UL>
        <LI>
          <B>Your account:</B> the email address you sign up with, and a display name and profile
          photo if you add one. Your password is handled by Supabase Auth — the app never sees or
          stores it.
        </LI>
        <LI>
          <B>Your content:</B> folders, notes and everything in them (text, checklists, tags, due
          dates, status, note colours) and the files you attach.
        </LI>
        <LI>
          <B>Your timezone:</B> recorded when you set a due date, so a reminder email shows the time
          in your own clock rather than the server&rsquo;s.
        </LI>
        <LI>
          <B>Small preferences in your browser:</B> light or dark theme, which folders you left
          expanded, the editor toggles and where you parked the bottom bar. These stay in your
          browser&rsquo;s local storage and are never sent anywhere.
        </LI>
      </UL>

      <H>Who can see it</H>
      <P>
        Only your account. Every folder, note and file row is tied to your user id and the database
        enforces that with row-level security, so one account cannot read another&rsquo;s data.
        Attachments live in a private storage bucket and are served through short-lived signed
        links.
      </P>
      <P>
        One exception worth stating plainly: <B>profile photos are stored in a public bucket</B>.
        The URL isn&rsquo;t published anywhere, but anyone who has it could open the image. If that
        matters to you, don&rsquo;t upload a profile photo.
      </P>

      <H>Where it&rsquo;s stored</H>
      <P>
        Everything is hosted with Supabase — a Postgres database and object storage — on servers in
        Seoul (AWS ap-northeast-2). Authentication is handled by Supabase Auth. The web app is
        served by Vercel; the Android app runs the same code from the installed package.
      </P>

      <H>Email</H>
      <P>
        The only email the app sends you, apart from account confirmation and password recovery from
        Supabase, is a due-date reminder. It contains the note&rsquo;s title, its due time and a link
        to it, and it&rsquo;s delivered over Gmail&rsquo;s SMTP from the operator&rsquo;s mailbox.
        There are no newsletters and no marketing email.
      </P>

      <H>What isn&rsquo;t happening</H>
      <UL>
        <LI>No analytics, no tracking pixels, no advertising, no cookie banners — the app sets no
        tracking cookies at all, and your session is kept in local storage.</LI>
        <LI>Your notes are not sold, shared, or handed to anyone else, and they are not used to
        train anything.</LI>
        <LI>No third-party services receive your content beyond the hosting described above.</LI>
      </UL>

      <H>Deleting things</H>
      <P>
        Deleting a note or folder in the app removes its rows and its attachment files. There is no
        in-app &ldquo;delete my account&rdquo; button yet — email{' '}
        <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> and the account and everything in it
        will be removed.
      </P>

      <H>Backups</H>
      <P>
        Database backups are not currently configured. Notes are stored, but they are not
        additionally backed up, so please keep your own copy of anything important — any note can be
        exported as Markdown, or printed to PDF from the web app.
      </P>

      <H>Changes</H>
      <P>
        If the app starts doing something this page doesn&rsquo;t describe, this page gets updated
        first. The date at the top says when it last changed.
      </P>

      <H>Contact</H>
      <P>
        Questions, or a deletion request: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
      </P>
    </LegalScreen>
  )
}

export function TermsPage() {
  return (
    <LegalScreen title="Terms of use" updated={LAST_UPDATED}>
      <P>
        Mindstack is a free personal project. Using it means accepting the terms below. They&rsquo;re
        short because the service is small.
      </P>

      <H>The service, as it is</H>
      <P>
        The app is provided as-is and free of charge. There is no paid plan, no billing, and no
        service-level promise: it may be unavailable, and features may change or be removed. Database
        backups aren&rsquo;t configured, so keep your own copies of anything you can&rsquo;t afford
        to lose.
      </P>

      <H>Your account</H>
      <UL>
        <LI>Sign-up needs a working email address, which you&rsquo;ll be asked to confirm.</LI>
        <LI>You&rsquo;re responsible for keeping your password to yourself and for what happens
        under your account.</LI>
        <LI>You can stop using the app whenever you like. To have the account and its data removed,
        email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.</LI>
      </UL>

      <H>Your content stays yours</H>
      <P>
        You keep all rights to the notes and files you store. They&rsquo;re held only so the app can
        show them back to you, and they&rsquo;re not used for anything else — see the{' '}
        <Link to="/privacy" className="text-[var(--color-accent)] hover:underline">
          Privacy page
        </Link>
        .
      </P>

      <H>What you may store</H>
      <UL>
        <LI>Attachments: images (PNG, JPEG, WebP, GIF), PDFs, Word documents, spreadsheets and CSV
        files, up to 10 MB per file.</LI>
        <LI>Nothing unlawful, and nothing you don&rsquo;t have the right to store.</LI>
        <LI>Don&rsquo;t try to reach other accounts&rsquo; data, break the service, or use it to
        send anyone unwanted mail.</LI>
      </UL>

      <H>Suspension</H>
      <P>
        An account that breaks these terms may be suspended or removed. Where the situation allows,
        you&rsquo;ll be contacted at your account email first.
      </P>

      <H>Liability</H>
      <P>
        Because this is a free, personally-run service, it comes with no warranty of any kind, and
        the operator isn&rsquo;t liable for lost data or losses arising from using it — which is the
        honest reason the backup note above matters.
      </P>

      <H>Changes</H>
      <P>
        These terms may change as the app does. The date at the top says when they last did;
        continuing to use the app means the current version applies.
      </P>

      <H>Contact</H>
      <P>
        Anything about these terms: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
      </P>
    </LegalScreen>
  )
}

function LegalScreen({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/welcome"
            className="anim-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            <ProjectLogo className="h-3.5 w-[19px] text-[var(--color-accent)]" />
            Mindstack
          </Link>
          <span className="ml-auto text-[13px] text-[var(--color-text-muted)]">Updated {updated}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1
          className="text-[30px] font-semibold tracking-tight sm:text-[38px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        <div className="mt-6">{children}</div>

        <p className="mt-10 border-t border-[var(--color-border)] pt-5 text-[13px] text-[var(--color-text-muted)]">
          <Link to="/privacy" className="hover:text-[var(--color-text)] hover:underline">
            Privacy
          </Link>
          <span className="px-2">·</span>
          <Link to="/terms" className="hover:text-[var(--color-text)] hover:underline">
            Terms
          </Link>
          <span className="px-2">·</span>
          <Link to="/welcome" className="hover:text-[var(--color-text)] hover:underline">
            Home
          </Link>
        </p>
      </main>
    </div>
  )
}

function H({ children }: { children: ReactNode }) {
  return (
    <h2
      className="mt-8 text-[17px] font-semibold tracking-tight"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-text-muted)]">{children}</p>
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2">{children}</ul>
}

function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-4 text-[14.5px] leading-relaxed text-[var(--color-text-muted)]">
      <span className="absolute left-0 top-[0.6em] h-1 w-1 rounded-full bg-[var(--color-accent)]" aria-hidden />
      {children}
    </li>
  )
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[var(--color-text)]">{children}</strong>
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-[var(--color-accent)] hover:underline">
      {children}
    </a>
  )
}
