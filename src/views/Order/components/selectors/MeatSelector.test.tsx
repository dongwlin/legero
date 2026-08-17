/* @vitest-environment jsdom */

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactNode,
} from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEAT, type MeatCode } from '@/types'
import { MeatSelector } from './MeatSelector'

type CheckboxRootProps = {
  children: ReactNode
  className?: string
  isSelected?: boolean
  onChange?: (checked: boolean) => void
}

type CheckboxContentProps = {
  children: ReactNode
  className?: string
  onToggle?: () => void
}

vi.mock('@heroui/react', () => {
  const CheckboxContent = ({
    children,
    className,
    onToggle,
  }: CheckboxContentProps) => (
    <button
      type='button'
      data-slot='checkbox-content'
      className={className}
      onClick={onToggle}
    >
      {children}
    </button>
  )

  const CheckboxRoot = ({
    children,
    className,
    isSelected = false,
    onChange,
  }: CheckboxRootProps) => (
    <div
      role='checkbox'
      aria-checked={isSelected}
      data-selected={isSelected}
      data-slot='checkbox'
      className={className}
    >
      {Children.map(children, (child) =>
        isValidElement<CheckboxContentProps>(child) &&
        child.type === CheckboxContent
          ? cloneElement(child, {
              onToggle: () => onChange?.(!isSelected),
            })
          : child,
      )}
    </div>
  )

  return {
    Checkbox: {
      Root: CheckboxRoot,
      Content: CheckboxContent,
      Control: ({ children, className }: CheckboxContentProps) => (
        <span data-slot='checkbox-control' className={className}>
          {children}
        </span>
      ),
      Indicator: () => <span data-slot='checkbox-indicator' />,
    },
    Label: ({ children, className }: CheckboxContentProps) => (
      <span data-slot='label' className={className}>
        {children}
      </span>
    ),
  }
})

const MeatSelectorHarness = ({
  initialSelectedMeatCodes = [],
}: {
  initialSelectedMeatCodes?: MeatCode[]
}) => {
  const [selectedMeatCodes, setSelectedMeatCodes] = useState<MeatCode[]>(
    initialSelectedMeatCodes,
  )

  return (
    <>
      <MeatSelector
        selectedMeatCodes={selectedMeatCodes}
        onSelectedMeatCodesChange={setSelectedMeatCodes}
        showPorkKidney
      />
      <output data-testid='selected-meat-codes'>
        {selectedMeatCodes.join(',')}
      </output>
    </>
  )
}

const getMeatRoot = (label: string): HTMLElement =>
  screen.getByText(label).closest('[data-slot="checkbox"]') as HTMLElement

describe('MeatSelector', () => {
  afterEach(() => {
    cleanup()
  })

  it('allows adding a second meat and removing an already selected meat from the checkbox control', () => {
    render(<MeatSelectorHarness initialSelectedMeatCodes={[MEAT.leanPork]} />)

    const selectedMeatRoot = getMeatRoot('瘦肉')
    const secondMeatRoot = getMeatRoot('猪肝')

    fireEvent.click(secondMeatRoot.querySelector('[data-slot="checkbox-control"]')!)
    expect(screen.getByTestId('selected-meat-codes').textContent).toBe('1,2')

    fireEvent.click(selectedMeatRoot.querySelector('[data-slot="checkbox-control"]')!)
    expect(screen.getByTestId('selected-meat-codes').textContent).toBe('2')
  })

  it('toggles a meat when clicking the blank area of its full-width visual tile', () => {
    render(<MeatSelectorHarness />)

    const meatRoot = getMeatRoot('瘦肉')
    const meatTile = meatRoot.querySelector(
      '[data-slot="checkbox-content"]',
    ) as HTMLElement

    expect(meatTile.classList.contains('rounded-xl')).toBe(true)
    expect(meatTile.classList.contains('w-full')).toBe(true)

    fireEvent.click(meatTile)
    expect(screen.getByTestId('selected-meat-codes').textContent).toBe('1')

    fireEvent.click(meatTile)
    expect(screen.getByTestId('selected-meat-codes').textContent).toBe('')
  })
})
