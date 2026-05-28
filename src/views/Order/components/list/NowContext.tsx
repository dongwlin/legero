import React, { createContext, useContext, useEffect, useState } from 'react'

const NowContext = createContext<number>(Date.now())

export const useNow = () => useContext(NowContext)

type NowProviderProps = {
  children: React.ReactNode
  active: boolean
}

export const NowProvider: React.FC<NowProviderProps> = ({ children, active }) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const frameId = window.requestAnimationFrame(() => setNow(Date.now()))
    const interval = setInterval(() => setNow(Date.now()), 1000)

    return () => {
      window.cancelAnimationFrame(frameId)
      clearInterval(interval)
    }
  }, [active])

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>
}
