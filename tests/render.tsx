import '@/App.css'
import '@/index.css'
import '@/tailwind.css'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { createMemoryRouter, type InitialEntry } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import AppBootstrap from '@/components/AppBootstrap'
import { createAppRoutes } from '@/routes/appRoutes'
import { Toast } from '@heroui/react'

export type RenderWithAppOptions = Omit<RenderOptions, 'wrapper'> & {
  bootstrap?: boolean
  initialEntries?: InitialEntry[]
}

export type AppRenderResult = RenderResult & {
  router: ReturnType<typeof createMemoryRouter>
}

/**
 * Mount the production route graph with a fresh memory Router and the real
 * application bootstrap and Toast provider. `bootstrap: false` is useful for
 * page scenarios that seed an already authenticated Zustand session, while
 * still exercising the real protected route and order synchronization.
 */
export const renderWithApp = ({
  bootstrap = true,
  initialEntries = ['/'],
  ...options
}: RenderWithAppOptions = {}): AppRenderResult => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries })
  const app = (
    <>
      <Toast.Provider placement='top' />
      <RouterProvider router={router} />
    </>
  )
  const tree = bootstrap ? <AppBootstrap>{app}</AppBootstrap> : app

  return Object.assign(render(tree, options), { router })
}
