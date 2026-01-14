import { DailyStats } from '@/services/statistics'
import React from 'react'

interface DailyStatsCardProps {
  stats: Map<string, DailyStats>
}

const DailyStatsCard: React.FC<DailyStatsCardProps> = ({ stats }) => {
  return (
    <div className="card bg-base-200 shadow-lg rounded-xl mb-6">
      <div className="card-body p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">每日统计详情</h2>
        
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead>
              <tr>
                <th className="text-base font-bold">日期</th>
                <th className="text-base font-bold text-right">总流水</th>
                <th className="text-base font-bold text-right">总订单数</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(stats.entries()).length === 0 ? (
                 <tr>
                   <td colSpan={3} className="text-center py-8 text-base-content/70">
                     暂无统计数据
                   </td>
                 </tr>
              ) : (
                Array.from(stats.entries()).map(([key, value]) => (
                  <tr key={key}>
                    <td className="font-medium text-base">{key}</td>
                    <td className="text-right font-mono text-base">¥{value.totalAmount.toFixed(2)}</td>
                    <td className="text-right text-base">{value.orderCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default DailyStatsCard