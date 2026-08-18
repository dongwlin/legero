import { Outlet } from 'react-router'
import { StatisticsProvider } from './StatisticsProvider'

const StatisticsLayout = () => (
  <StatisticsProvider>
    <Outlet />
  </StatisticsProvider>
)

export default StatisticsLayout
