import type { ReactNode } from 'react'

export interface HeaderProps {
  fileCount: number
  onAddFiles: () => void
  onAddFolder: () => void
}

export function Header({ fileCount, onAddFiles, onAddFolder }: HeaderProps): ReactNode {
  return (
    <header className="header">
      <div className="header__title">
        <h1>File Converter</h1>
        {fileCount > 0 ? <span className="header__count">{fileCount} file{fileCount === 1 ? '' : 's'}</span> : null}
      </div>
      <div className="header__actions">
        <button type="button" className="btn btn--primary" onClick={onAddFiles} title="Add files (Ctrl+O)">
          Add files
        </button>
        <button type="button" className="btn" onClick={onAddFolder}>
          Add folder
        </button>
      </div>
    </header>
  )
}
