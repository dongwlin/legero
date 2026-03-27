import React from 'react'
import { useAuthSessionBootstrap } from '@/hooks/useAuthSessionBootstrap'

type AppBootstrapProps = {
  children: React.ReactNode
}

const AppBootstrap: React.FC<AppBootstrapProps> = ({ children }) => {
  useAuthSessionBootstrap()

  return <>{children}</>
}

export default AppBootstrap
