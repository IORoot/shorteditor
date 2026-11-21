import { useLoad } from '../shared/hooks/useLoad';
import type { ExportRecord, ExportStatus, OutputApi } from './lib/api';

export interface OutputPageProps {
  api: Pick<OutputApi, 'exports'>;
}

const STATUS: Record<ExportStatus, string> = { uploading: 'Uploading', uploaded: 'Uploaded', queued: 'Queued', unclear: 'Unclear', checked: 'Checked', failed: 'Failed' };
const CELL = 'px-3 py-2 text-left align-top';

export function OutputPage({ api }: OutputPageProps) {
  const { state } = useLoad<ExportRecord[]>(() => api.exports(), [api]);
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <h1 className="text-[30px] font-bold tracking-[-0.6px]">Output</h1>
      <p className="text-small text-text-2">Videos sent to Postiz, newest first.</p>
      {state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading…</p> : null}
      {state.status === 'error' ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{state.message}</p> : null}
      {state.status === 'ready' && state.data.length === 0 ? <p className="text-small text-text-2">Nothing has been posted yet</p> : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="overflow-x-auto rounded-[14px] bg-surface">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="text-caption font-semibold text-text-2">
                {['Time', 'Batch', 'Card', 'Status', 'Postiz pipeline', 'Media ID', 'Queue ID'].map((heading) => (
                  <th key={heading} scope="col" className={CELL}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.map((record) => (
                <tr key={record.id} className="border-t border-fill-2">
                  <td className={CELL}>{new Date(record.updatedAt).toLocaleString()}</td>
                  <td className={CELL}>{record.batchName}</td>
                  <td className={CELL}>{record.cardNumber}</td>
                  <td className={CELL}>
                    <span className="font-medium">{STATUS[record.status]}</span>
                    {record.status === 'unclear' ? <span className="block text-caption text-bad">Check Postiz before trying again</span> : null}
                    {record.status === 'failed' && record.message ? <span className="block break-words text-caption text-bad">{record.message}</span> : null}
                  </td>
                  <td className={CELL}>{record.pipelineId ?? '–'}</td>
                  <td className={CELL}>{record.mediaId ?? '–'}</td>
                  <td className={CELL}>{record.queueId ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
