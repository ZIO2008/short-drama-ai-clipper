import type { ReactElement } from 'react'

export type IconName = 'library' | 'tasks' | 'tags' | 'settings' | 'bell' | 'close' | 'grid' | 'list' | 'trash'

export const UiIcon = ({ name }: { name: IconName }): ReactElement => (
  <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {getPaths(name)}
  </svg>
)

const getPaths = (name: IconName): ReactElement => {
  switch (name) {
    case 'library':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 4v16" />
        </>
      )
    case 'tasks':
      return (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4.5h6M9 10h6M9 14h6M9 18h4" />
        </>
      )
    case 'tags':
      return (
        <>
          <path d="M20 13.5 13.5 20 4 10.5V4h6.5L20 13.5Z" />
          <circle cx="7.8" cy="7.8" r="1" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
        </>
      )
    case 'bell':
      return (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </>
      )
    case 'close':
      return <path d="m7 7 10 10M17 7 7 17" />
    case 'grid':
      return <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>
    case 'list':
      return <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>
    case 'trash':
      return <><path d="M4 7h16M10 11v5M14 11v5M6.5 9l.8 11h9.4l.8-11M9 4h6v3H9z" /></>
  }
}
