import { Link } from 'react-router-dom'

export function GetAppPage() {
  const driveUrl = 'https://drive.google.com/file/d/1Lyc4k1mGqgwrQ8VRx1Rvepwb84-1_lGz/view?usp=sharing'

  return (
    <div className="min-h-full bg-[var(--color-surface)] text-[var(--color-text)]">
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="mb-4 text-3xl font-extrabold">Get the app</h1>
        <p className="mb-6 text-[14px] text-[var(--color-text-muted)]">
          Download the Android APK from the link below. On Android, open the downloaded file to
          install — you may need to allow installs from unknown sources.
        </p>

        <p className="mb-6">
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-white"
          >
            Download APK
            <span className="ml-2">↗</span>
          </a>
        </p>

        <h2 className="mt-8 mb-2 text-xl font-bold">iOS users</h2>
        <p className="text-[14px] text-[var(--color-text-muted)] mb-6">
          iOS builds are not available for direct install. To use the app on iOS, install via
          TestFlight (coming soon) or add the web app to your Home Screen as a PWA.
        </p>

        <Link to="/welcome" className="text-sm text-[var(--color-text-muted)] hover:underline">
          ← Back to welcome
        </Link>
      </main>
    </div>
  )
}

export default GetAppPage
