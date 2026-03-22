import { Card } from '@heroui/react'
import React from 'react'

interface SettingsSectionProps {
  children: React.ReactNode
  description?: string
  title: string
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  children,
  description,
  title,
}) => {
  return (
    <Card.Root
      variant='secondary'
      className='border border-border/70 p-0 shadow-surface'
    >
      <Card.Header className='gap-1 px-6 pt-6'>
        <Card.Title className='text-lg md:text-xl'>{title}</Card.Title>
        {description ? (
          <Card.Description className='leading-6'>{description}</Card.Description>
        ) : null}
      </Card.Header>
      <Card.Content className='px-6 pb-6 pt-4'>{children}</Card.Content>
    </Card.Root>
  )
}

export default SettingsSection
