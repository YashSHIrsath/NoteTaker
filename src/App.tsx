import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppLayout } from './pages/AppLayout'
import { AuthenticatedApp } from './pages/AuthenticatedApp'
import { GuestOnly, RequireAuth } from './pages/AuthGate'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { TreePage } from './pages/TreePage'
import { MyNotesPage } from './pages/MyNotesPage'
import { FolderViewPage } from './pages/FolderViewPage'
import { TaskViewPage } from './pages/TaskViewPage'
import { ImportantPage } from './pages/ImportantPage'

function App() {
  return (
    <BrowserRouter>
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
                <Route path="/important" element={<ImportantPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
