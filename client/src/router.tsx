import { createBrowserRouter } from 'react-router';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import ResetPasswordPage from './pages/reset-password';
import RootRedirect from './pages/root-redirect';
import ProtectedLayout from './pages/protected-layout';
import MyTasksPage from './pages/my-tasks';
import AllTasksPage from './pages/all-tasks';
import ProjectPage from './pages/project';
import BoardPage from './pages/project-board';
import ProjectTimelinePage from './pages/project-timeline';
import GlobalTimelinePage from './pages/timeline';
import SprintsPage from './pages/sprints';
import SettingsPage from './pages/settings';
import AdminPage from './pages/admin';
import { AuthGuard } from './components/auth-guard';
import { AuthProvider } from './hooks/use-auth';

function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground">Page not found</p>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <AuthProvider><LoginPage /></AuthProvider>,
  },
  {
    path: '/signup',
    element: <AuthProvider><SignupPage /></AuthProvider>,
  },
  {
    path: '/reset-password',
    element: <AuthProvider><ResetPasswordPage /></AuthProvider>,
  },
  {
    path: '/',
    element: <AuthProvider><AuthGuard><ProtectedLayout /></AuthGuard></AuthProvider>,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'projects/:id/board', element: <BoardPage /> },
      { path: 'projects/:id/timeline', element: <ProjectTimelinePage /> },
      { path: 'all-tasks', element: <AllTasksPage /> },
      { path: 'my-tasks', element: <MyTasksPage /> },
      { path: 'sprints', element: <SprintsPage /> },
      { path: 'timeline', element: <GlobalTimelinePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
