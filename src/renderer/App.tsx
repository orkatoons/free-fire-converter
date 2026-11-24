// Composition layer: pulls state/actions from hooks and hands them to presentational components.

import type { ReactNode } from 'react'
import { EmptyState, DropOverlay } from './components/EmptyState'
import { FileList } from './components/FileList'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Dialog, Notices, SummaryBanner } from './components/Overlays'
import { SettingsPanel } from './components/SettingsPanel'
import { SystemBanner } from './components/SystemBanner'
import {
  useInit,
  useJobRows,
  useKeyboardShortcuts,
  useNoticeAutoDismiss,
  useSettingsModel,
  useTotals,
  useWindowDrop
} from './state/hooks'
import { useAppStore } from './state/store'

export function App(): ReactNode {
  useInit()
  useWindowDrop()
  useKeyboardShortcuts()
  useNoticeAutoDismiss()

  const s = useAppStore()
  const rows = useJobRows()
  const totals = useTotals()
  const model = useSettingsModel()

  if (!s.ready) return <div className="loading">Loading…</div>

  return (
    <div className="app">
      <Header fileCount={s.jobs.length} onAddFiles={() => void s.pickFiles()} onAddFolder={() => void s.pickFolderToAdd()} />
      <SystemBanner
        caps={s.caps}
        loading={s.capsLoading}
        verifiedHardware={model.verifiedHardware}
        onPickFfmpegDir={() => void s.pickFfmpegDir()}
        onRetry={() => void s.refreshCaps()}
      />
      <SummaryBanner summary={s.summary} onOpenFolder={s.openPath} onDismiss={s.dismissSummary} />

      <main className="app__body">
        <div className="app__files">
          {rows.length === 0 ? (
            <EmptyState container={s.settings.convert.container} onAddFiles={() => void s.pickFiles()} onAddFolder={() => void s.pickFolderToAdd()} />
          ) : (
            <FileList
              rows={rows}
              convert={s.settings.convert}
              caps={s.caps}
              selectedCount={s.selected.length}
              onRemoveSelected={() => void s.removeSelected()}
              onClearSelection={s.clearSelection}
              onSelect={s.select}
              onRemove={(id) => void s.remove([id])}
              onCancel={(id) => void s.cancel(id)}
              onRetry={(id) => void s.retry(id)}
              onStartOne={(id) => void s.start([id])}
              onReveal={s.reveal}
              onOpen={s.openPath}
              onShowLog={(id) => void s.showLog(id)}
              onShowCommand={(id) => void s.showCommand(id)}
              onCopyCommand={(id) => void s.copyCommand(id)}
            />
          )}
        </div>
        <SettingsPanel
          settings={s.settings}
          presets={s.presets}
          model={model}
          disabled={false}
          onConvert={s.updateConvert}
          onOutput={s.updateOutput}
          onApp={s.updateApp}
          onApplyPreset={s.applyPreset}
          onSavePreset={(n) => void s.savePreset(n)}
          onDeletePreset={(id) => void s.deletePreset(id)}
          onPickOutputFolder={() => void s.pickOutputFolder()}
          onUseSourceFolder={s.useSourceFolder}
          onPickFfmpegDir={() => void s.pickFfmpegDir()}
          onClearFfmpegDir={() => void s.clearFfmpegDir()}
          onRefreshCaps={() => void s.refreshCaps()}
        />
      </main>

      <Footer
        queue={s.queue}
        totals={totals}
        rows={rows}
        container={s.settings.convert.container}
        outputLabel={model.outputLabel}
        onStart={() => void s.start()}
        onPause={() => void s.pause()}
        onResume={() => void s.resume()}
        onCancelAll={() => void s.cancelAll()}
        onClearFinished={() => void s.clearFinished()}
      />

      <DropOverlay visible={s.dragOver} />
      <Notices notices={s.notices} onDismiss={s.dismissNotice} />
      <Dialog dialog={s.dialog} onClose={s.closeDialog} onCopy={(t) => void s.copyText(t)} />
    </div>
  )
}
