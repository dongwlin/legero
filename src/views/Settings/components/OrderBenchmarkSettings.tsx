import { Link } from 'react-router'
import SettingsSection from '@/views/Settings/components/SettingsSection'

const OrderBenchmarkSettings = () => (
  <div className='[&_[data-slot=card-description]]:text-foreground/75'>
    <SettingsSection
      title='订单基准测试'
      description='模拟不同订单量，测量当前设备的本地处理耗时。'
    >
      <Link
        to='/settings/benchmark'
        className='group flex min-h-11 w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background-secondary/60 p-4 text-left transition-colors duration-200 hover:border-accent/40 hover:bg-background-secondary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      >
        <span className='min-w-0'>
          <span className='block text-base font-medium text-foreground'>
            测试订单处理性能
          </span>
          <span className='mt-1 block text-sm leading-6 text-foreground/75'>
            每次运行 5 轮取平均值，可保存完整结果文件用于门店排查。
          </span>
        </span>
        <span className='shrink-0 text-sm font-medium text-foreground transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-0.5'>
          测试
        </span>
      </Link>
    </SettingsSection>
  </div>
)

export default OrderBenchmarkSettings
