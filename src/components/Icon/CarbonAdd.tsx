import { SVGProps } from 'react'

export function CarbonAdd(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='1em'
      height='1em'
      viewBox='0 0 32 32'
      {...props}
    >
      <path fill='currentColor' d='M17 15V8h-2v7H8v2h7v7h2v-7h7v-2z'></path>
    </svg>
  )
}
