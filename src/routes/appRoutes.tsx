import AuthRoute from '@/routes/AuthRoute'
import ProtectedRoute from '@/routes/ProtectedRoute'
import Home from '@/views/Home'
import NotFound from '@/views/NotFound'
import Order from '@/views/Order'
import Settings from '@/views/Settings'
import RealtimeDiagnostics from '@/views/Settings/Diagnostics'
import StatisticsLayout from '@/views/Statistics/Layout'
import Statistic from '@/views/Statistics'
import DailyReport from '@/views/Statistics/Report'
import type { RouteObject } from 'react-router'

export const createAppRoutes = (): RouteObject[] => [
  {
    path: '/auth',
    element: <AuthRoute />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <Home />,
      },
      {
        path: '/order',
        element: <Order />,
      },
      {
        path: '/statistics',
        element: <StatisticsLayout />,
        children: [
          {
            index: true,
            element: <Statistic />,
          },
          {
            path: 'report/:date',
            element: <DailyReport />,
          },
        ],
      },
      {
        path: '/settings',
        element: <Settings />,
      },
      {
        path: '/settings/diagnostics',
        element: <RealtimeDiagnostics />,
      },
      {
        path: '/settings/benchmark',
        lazy: async () => ({
          Component: (await import('@/views/Settings/Benchmark')).default,
        }),
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
]
