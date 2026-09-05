export interface HtmlPreviewFrameProps {
  /** Used only for the iframe's accessible title, not rendered. */
  title: string
  html: string
}

const PREVIEW_STYLES = `
  /* Explicit light scheme + background: without it, a browser whose OS/UI is in dark mode (Chrome
     and Edge's "auto dark mode for web contents") auto-inverts this iframe's colors, since srcDoc
     content never declares a background of its own to prove it was designed for dark mode. The
     result was unreadable — dark-on-dark text with a random dark tint — regardless of what colour
     this app's own theme toggle was set to, because the iframe is a separate document the browser
     judges independently. Pinned to light so the preview always renders the same, predictable way. */
  :root { color-scheme: light; }
  body { margin: 16px; font: 14px/1.6 system-ui, sans-serif; color: #1a1a18; background: #ffffff; }
  h1, h2, h3, h4 { margin: 1em 0 0.4em; font-weight: 600; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.2rem; }
  h3 { font-size: 1.05rem; }
  p { margin: 0.6em 0; }
  ul, ol { margin: 0.6em 0; padding-left: 1.4em; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  td, th { border: 1px solid #e8e8e5; padding: 6px 8px; text-align: left; }
  code { background: #f2f1ee; border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.9em; }
  pre { background: #f2f1ee; border-radius: 8px; padding: 0.8em; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0.6em 0; padding-left: 0.9em; border-left: 3px solid #d8d6d0; color: #55534d; }
`

/**
 * A document converted to HTML (mammoth's .docx output, marked's markdown output) rendered in a
 * sandboxed iframe rather than injected into the app's own DOM.
 *
 * `sandbox="allow-same-origin"` with no `allow-scripts` is what makes this safe to use on content
 * neither library sanitizes: a `<script>` tag, or an inline `onerror`/`javascript:` handler smuggled
 * in through raw HTML embedded in the source document, cannot execute inside an iframe that was
 * never granted script permission — that guarantee holds regardless of what the converter produced.
 */
export function HtmlPreviewFrame({ title, html }: HtmlPreviewFrameProps) {
  return (
    <iframe
      title={`${title} preview`}
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8" /><meta name="color-scheme" content="light" /><style>${PREVIEW_STYLES}</style></head><body>${html}</body></html>`}
      className="h-full w-full border-0 bg-[var(--color-surface)]"
    />
  )
}
