import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './pages/AppLayout'
import { AuthenticatedApp } from './pages/AuthenticatedApp'
import { GuestOnly, RequireAuth } from './pages/AuthGate'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { TreePage } from './pages/TreePage'
import { MyNotesPage } from './pages/MyNotesPage'
import { FolderViewPage } from './pages/FolderViewPage'
import { TaskViewPage } from './pages/TaskViewPage'
import { ImportantPage } from './pages/ImportantPage'
import { AllTasksPage } from './pages/AllTasksPage'
import { ProfilePage } from './pages/ProfilePage'

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
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  )
}

export default App
