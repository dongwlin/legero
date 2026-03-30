import React from 'react'
import { useAuthSessionBootstrap } from '@/hooks/useAuthSessionBootstrap'
import useAndroidBackButton from '@/hooks/useAndroidBackButton'

type AppBootstrapProps = {
  children: React.ReactNode
}

const AppBootstrap: React.FC<AppBootstrapProps> = ({ children }) => {
  useAuthSessionBootstrap()
  useAndroidBackButton()

  return <>{children}</>
}

export default AppBootstrap
