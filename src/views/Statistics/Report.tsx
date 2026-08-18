import PasswordLockScreen from '@/components/PasswordLockScreen'
import { Button, Card } from '@heroui/react'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import React, { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'
import Header from '@/components/Header'
import ReportDetailsCard from './components/ReportDetailsCard'
import { useStatisticsReports } from './hooks/useStatisticsReports'
import { isValidReportDate } from './reportDate'

interface InvalidReportDateProps {
  onBack: () => void
}

const InvalidReportDate: React.FC<InvalidReportDateProps> = ({ onBack }) => (
  <Card.Root
    variant='secondary'
    className='border border-border/70 p-0 shadow-surface'
  >
    <Card.Header className='gap-1 px-6 pt-6'>
      <Card.Title className='text-lg md:text-xl'>无法查看日报</Card.Title>
      <Card.Description className='leading-6'>
        日报地址需要使用有效的 YYYY-MM-DD 日期。
      </Card.Description>
    </Card.Header>
    <Card.Content className='space-y-4 px-6 pb-6 pt-4'>
      <p className='text-sm leading-6 text-danger' role='alert'>
        日期格式无效，请返回统计页重新选择日期。
      </p>
      <Button.Root variant='outline' onPress={onBack}>
        返回统计
      </Button.Root>
    </Card.Content>
  </Card.Root>
)

const DailyReport: React.FC = () => {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const passwordProtectionEnabled = usePasswordAuthStore(
    (state) => state.enabled,
  )
  const isPasswordAuthenticated = usePasswordAuthStore(
    (state) => state.isAuthenticated,
  )
  const authenticate = usePasswordAuthStore((state) => state.authenticate)
  const isValidDate = isValidReportDate(date)
  const reportDate = isValidDate && date ? date : null
  const reportEnabled = Boolean(
    reportDate && (!passwordProtectionEnabled || isPasswordAuthenticated),
  )
  const {
    errorMessage,
    isLoading,
    onRefresh,
    report,
  } = useStatisticsReports(reportDate, reportEnabled)

  const handleBack = useCallback(() => {
    navigate('/statistics', { replace: true })
  }, [navigate])

  if (passwordProtectionEnabled && !isPasswordAuthenticated) {
    return (
      <PasswordLockScreen onUnlock={authenticate} onCancel={handleBack} />
    )
  }

  return (
    <div className='min-h-dvh bg-background pb-20 text-foreground'>
      <Header
        backLabel='返回统计'
        backPath='/statistics'
        title={isValidDate && date ? `${date} 日报` : '日报详情'}
      />
      <main className='mx-auto max-w-4xl px-4 pt-[calc(5.25rem+env(safe-area-inset-top))] md:px-8'>
        {isValidDate && date ? (
          <ReportDetailsCard
            errorMessage={errorMessage}
            isLoading={isLoading}
            onRefresh={onRefresh}
            report={report}
            selectedDate={date}
          />
        ) : (
          <InvalidReportDate onBack={handleBack} />
        )}
      </main>
    </div>
  )
}

export default DailyReport
