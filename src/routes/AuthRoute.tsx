import React from 'react'
import { Navigate } from 'react-router'
import Auth from '@/views/Auth'
import { useAuthStore } from '@/store/auth'

const AuthRoute: React.FC = () => {
  const authStatus = useAuthStore((state) => state.status)
  const workspaceStatus = useAuthStore((state) => state.workspaceStatus)

  if (authStatus === 'authenticated' && workspaceStatus === 'ready') {
    return <Navigate to='/' replace />
  }

  return <Auth />
}

export default AuthRoute
