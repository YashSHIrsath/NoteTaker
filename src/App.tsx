import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './pages/AppLayout'
import { AuthenticatedApp } from './pages/AuthenticatedApp'
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

function App() {
  return (
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
            <Route element={<RequireAuth />}>
              <Route element={<AuthenticatedApp />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<TreePage />} />
                  <Route path="/mynotes" element={<MyNotesPage />} />
                  <Route path="/folder/:folderId" element={<FolderViewPage />} />
                  <Route path="/task/:taskId" element={<TaskViewPage />} />
                  <Route path="/tasks" element={<AllTasksPage />} />
                  <Route path="/important" element={<ImportantPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
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
  )
}

export default App
