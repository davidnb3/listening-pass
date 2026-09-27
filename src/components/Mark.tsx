type MarkProps = {
  className?: string
}

export function Mark({ className }: MarkProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 14.5c1.8-5.2 3.4-5.2 5.2 0s3.4 5.2 5.2 0 3.4-5.2 5.2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
