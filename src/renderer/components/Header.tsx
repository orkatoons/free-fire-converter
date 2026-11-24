import type { ReactNode } from 'react'
import { IconFolder, IconPlus, LineMark } from './icons'

export interface HeaderProps {
  fileCount: number
  version: string | null
  onAddFiles: () => void
  onAddFolder: () => void
}

export function Header({ fileCount, version, onAddFiles, onAddFolder }: HeaderProps): ReactNode {
  return (
    <header className="header">
      <div className="header__brand">
        <LineMark />
        <h1 className="header__name">File Converter</h1>
        {version ? <span className="header__version">v{version}</span> : null}
        {fileCount > 0 ? (
          <span className="header__count">
            {fileCount} file{fileCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <div className="header__actions">
        <button type="button" className="btn" onClick={onAddFiles} title="Add files (Ctrl+O)">
          <IconPlus /> Add files
        </button>
        <button type="button" className="btn" onClick={onAddFolder}>
          <IconFolder /> Add folder
        </button>
      </div>
    </header>
  )
}
