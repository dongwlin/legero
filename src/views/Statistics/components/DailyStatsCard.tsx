import { DailyStats } from '@/services/statistics'
import { formatPriceCents } from '@/services/orderPricing'
import { Card, EmptyState, Table } from '@heroui/react'
import React from 'react'

interface DailyStatsCardProps {
  stats: Map<string, DailyStats>
}

const DailyStatsCard: React.FC<DailyStatsCardProps> = ({ stats }) => {
  const rows = Array.from(stats.entries()).map(([date, summary]) => ({
    date,
    ...summary,
  }))

  return (
    <Card.Root
      variant='secondary'
      className='border border-border/70 p-0 shadow-surface'
    >
      <Card.Header className='gap-1 px-6 pt-6'>
        <Card.Title className='text-lg md:text-xl'>每日统计详情</Card.Title>
        <Card.Description className='leading-6'>
          {rows.length > 0
            ? `已生成 ${rows.length} 天的订单汇总数据。`
            : '点击上方按钮后，这里会展示每日订单汇总结果。'}
        </Card.Description>
      </Card.Header>

      <Card.Content className='px-6 pb-6 pt-4'>
        {rows.length === 0 ? (
          <EmptyState.Root className='rounded-2xl border border-dashed border-border/70 bg-background-secondary/40 px-6 py-10 text-center leading-6'>
            暂无统计数据
          </EmptyState.Root>
        ) : (
          <Table.Root variant='secondary'>
            <Table.ScrollContainer>
              <Table.Content aria-label='每日统计详情'>
                <Table.Header>
                  <Table.Column isRowHeader className='text-sm font-semibold'>
                    日期
                  </Table.Column>
                  <Table.Column className='text-right text-sm font-semibold'>
                    总流水
                  </Table.Column>
                  <Table.Column className='text-right text-sm font-semibold'>
                    总订单数
                  </Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((row) => (
                    <Table.Row key={row.date} id={row.date}>
                      <Table.Cell className='text-sm font-medium md:text-base'>
                        {row.date}
                      </Table.Cell>
                      <Table.Cell className='text-right font-mono tabular-nums md:text-base'>
                        {formatPriceCents(row.totalPriceCents, {
                          fixedFractionDigits: 2,
                        })}
                      </Table.Cell>
                      <Table.Cell className='text-right tabular-nums md:text-base'>
                        {row.orderCount}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table.Root>
        )}
      </Card.Content>
    </Card.Root>
  )
}

export default DailyStatsCard
