import { createBrowserRouter } from 'react-router';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import ResetPasswordPage from './pages/reset-password';
import ForgotPasswordPage from './pages/forgot-password';
import SetNewPasswordPage from './pages/set-new-password';
import RootRedirect from './pages/root-redirect';
import ProtectedLayout from './pages/protected-layout';
import MyTasksPage from './pages/my-tasks';
import AllTasksPage from './pages/all-tasks';
import ProjectPage from './pages/project';
import BoardPage from './pages/project-board';
import ProjectTimelinePage from './pages/project-timeline';
import GlobalTimelinePage from './pages/timeline';
import SprintsPage from './pages/sprints';
import ReportsPage from './pages/reports';
import ReportDetailPage from './pages/report-detail';
import SettingsPage from './pages/settings';
import AdminPage from './pages/admin';
import NotFoundPage from './pages/not-found';
import { AuthGuard } from './components/auth-guard';
import { AuthProvider } from './hooks/auth-provider';
import { ErrorBoundary } from './components/error-boundary';

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
    path: '/forgot-password',
    element: <AuthProvider><ForgotPasswordPage /></AuthProvider>,
  },
  {
    path: '/set-new-password',
    element: <AuthProvider><SetNewPasswordPage /></AuthProvider>,
  },
  {
    path: '/',
    element: <AuthProvider><AuthGuard><ErrorBoundary><ProtectedLayout /></ErrorBoundary></AuthGuard></AuthProvider>,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'projects/:id/board', element: <BoardPage /> },
      { path: 'projects/:id/timeline', element: <ProjectTimelinePage /> },
      { path: 'all-tasks', element: <AllTasksPage /> },
      { path: 'my-tasks', element: <MyTasksPage /> },
      { path: 'sprints', element: <SprintsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/:id', element: <ReportDetailPage /> },
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
