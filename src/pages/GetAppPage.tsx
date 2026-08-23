import { Download } from 'lucide-react'
import { StaticPage, DocH as H, DocP as P } from '../components/layout/StaticPage'

const APK_URL = 'https://drive.google.com/file/d/1Lyc4k1mGqgwrQ8VRx1Rvepwb84-1_lGz/view?usp=sharing'

export function GetAppPage() {
  return (
    <StaticPage title="Get the app">
      <P>
        Download the Android APK from the link below. On Android, open the downloaded file to
        install — you may need to allow installs from unknown sources.
      </P>

      <p className="mt-6">
        <a
          href={APK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="anim-press inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Download APK
          <Download className="h-4 w-4" aria-hidden />
        </a>
      </p>

      <H>iOS</H>
      <P>
        There’s no iOS build to install directly. Open the web app in Safari and add it to your
        Home Screen — it installs as a PWA and behaves the same.
      </P>

      <H>Or just use the web app</H>
      <P>
        The browser version is the same app, and it installs to the home screen on Android too.
        Everything syncs to your account either way.
      </P>
    </StaticPage>
  )
}

export default GetAppPage
