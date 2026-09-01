import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './pages/AppLayout'
import { AuthenticatedApp, SpaceApp, SpaceFallback, SpacesShell } from './pages/AuthenticatedApp'
import { GuestOnly, RequireAuth } from './pages/AuthGate'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { LandingPage } from './pages/LandingPage'
import { GetAppPage } from './pages/GetAppPage'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { TreePage } from './pages/TreePage'
import { MyNotesPage } from './pages/MyNotesPage'
import { FolderViewPage } from './pages/FolderViewPage'
import { TaskViewPage } from './pages/TaskViewPage'
import { ImportantPage } from './pages/ImportantPage'
import { AllTasksPage } from './pages/AllTasksPage'
import { ProfilePage } from './pages/ProfilePage'
import { SharedSpacesPage } from './pages/SharedSpacesPage'
import { InvitePage } from './pages/InvitePage'
import { SpaceActivityPage } from './pages/SpaceActivityPage'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { IS_NATIVE } from './lib/platform'

/**
 * Hash routing in the Capacitor app, path routing on the web.
 *
 * A native build serves its assets from a local origin with no server to rewrite unknown paths,
 * so a deep path like /folder/:id has nothing to fall back to — the same problem vercel.json
 * solves for the web build. The mode is fixed at build time (`vite build --mode native`), which
 * is exactly the granularity this needs.
 */
const Router = import.meta.env.MODE === 'native' ? HashRouter : BrowserRouter

/**
 * The pages of a workspace, mounted once per workspace.
 *
 * Written as relative paths and returned from a function rather than spelled out twice, because
 * "the same app, pointed at different content" is exactly what a shared space is. The personal
 * mount resolves these against "/" and the space mount against "/s/:spaceId"; nothing in the pages
 * themselves changes, or knows which one it is in.
 */
function workspaceRoutes() {
  return (
    <>
      {/* Starred is the front door: what a cold start, a dead deep link and the catch-all all land
        *  on, so it is the one screen that has to be worth opening on. Tree kept its content and
        *  its own path rather than being demoted to a redirect. */}
      <Route index element={<ImportantPage />} />
      <Route path="tree" element={<TreePage />} />
      <Route path="mynotes" element={<MyNotesPage />} />
      <Route path="folder/:folderId" element={<FolderViewPage />} />
      <Route path="task/:taskId" element={<TaskViewPage />} />
      <Route path="tasks" element={<AllTasksPage />} />
      <Route path="profile" element={<ProfilePage />} />
    </>
  )
}

function App() {
  return (
    // Outside the providers on purpose: this one catches what the page-level boundary cannot —
    // a provider, the router, the theme. It can only offer a reload, but a reload button beats a
    // blank screen, which is what an uncaught render error leaves behind.
    <ErrorBoundary scope="The app">
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <Routes>
              {/* Web only. The APK is the app itself, not a place to read a pitch or a policy:
                *  signed out it offers exactly sign in and create account. These three stay on the
                *  website, where a store listing or an email can link to them. */}
              {IS_NATIVE ? null : (
                <>
                  {/* Readable signed in or out — a policy you can only see by signing out is no use. */}
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route element={<GuestOnly />}>
                    <Route path="/welcome" element={<LandingPage />} />
                    <Route path="/get-app" element={<GetAppPage />} />
                  </Route>
                </>
              )}

              <Route element={<GuestOnly />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>

              {/* Outside the auth gate on purpose. Whoever follows an invite link may have no account
                *  at all — that is the case the link exists for — and RequireAuth redirects without
                *  keeping where you were going, which is exactly how an invitation gets lost. The page
                *  parks the token before anything else can move you. */}
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route element={<RequireAuth />}>
                {/* Which spaces exist for this account, above both workspaces — the list spans them,
                  *  and the space shell needs it to know its own name and colour. */}
                <Route element={<SpacesShell />}>
                  {/* The account's own notes. */}
                  <Route element={<AuthenticatedApp />}>
                    <Route element={<AppLayout />}>
                      {workspaceRoutes()}
                      {/* A list of workspaces rather than a page of one, so it is not part of
                        *  workspaceRoutes and has no /s/:spaceId twin. Tapping it from inside a space
                        *  is how you get back out. */}
                      <Route path="/spaces" element={<SharedSpacesPage />} />
                      {/* Bookmarks, and the notification links already sent out, still say /important. */}
                      <Route path="/important" element={<Navigate to="/" replace />} />
                    </Route>
                  </Route>

                  {/* A shared space: the same pages, pointed at content several people hold together.
                    *  The prefix is what makes a link to one shared note, the back button and a refresh
                    *  all keep working — an ambient "current space" with unchanged URLs breaks all three. */}
                  <Route path="/s/:spaceId" element={<SpaceApp />}>
                    <Route element={<AppLayout />}>
                      {workspaceRoutes()}
                      {/* Space-only, and so not part of workspaceRoutes: personal notes have no
                        *  activity log, because there is nobody to attribute anything to. */}
                      <Route path="activity" element={<SpaceActivityPage />} />
                      <Route path="*" element={<SpaceFallback />} />
                    </Route>
                  </Route>
                </Route>
              </Route>

              {/* A stale link, a typo, or a /welcome bookmark opened inside the app: land on the
                *  home route, which then sends a signed-out visitor to sign in. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
