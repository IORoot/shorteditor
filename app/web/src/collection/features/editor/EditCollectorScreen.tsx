import { useState } from 'react';
import { Check, ChevronLeft, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Collector, CollectorConfig } from '../../lib/types';
import { useFilterPreview } from '../../hooks/useFilterPreview';
import { useFolderPreview } from '../../hooks/useFolderPreview';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { SectionCard } from '../../../components/ui/SectionCard';
import { FilterPreviewCard } from './filterPreview/FilterPreviewCard';
import { FiltersSection } from './filters/FiltersSection';
import { FolderPicker } from './FolderPicker';
import { OutputSection } from './OutputSection';
import { PreviewPanel, SAMPLE_DATE } from './PreviewPanel';
import { SourceSection } from './SourceSection';

type PickerTarget = 'input' | 'output' | null;

export interface EditCollectorScreenProps {
  collector: Collector;
  onCancel: () => void;
  onSaved: () => void;
  onDelete: () => void;
}

export function EditCollectorScreen({ collector, onCancel, onSaved, onDelete }: EditCollectorScreenProps) {
  const [config, setConfig] = useState<CollectorConfig>(collector.config);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useFolderPreview(config, SAMPLE_DATE);
  const filterPreview = useFilterPreview(config);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveConfig(collector.id, config);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the collector');
    } finally {
      setSaving(false);
    }
  };

  const choose = (path: string) => {
    setConfig(picker === 'input' ? { ...config, inputFolder: path } : { ...config, outputFolder: path });
    setPicker(null);
  };

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_380px] gap-6 px-2 max-[1100px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-small font-medium text-text-2">
              <ChevronLeft size={14} aria-hidden="true" />
              Collectors / {collector.name}
            </button>
            <h1 className="text-h1 font-bold tracking-[-0.6px]">Edit Collector</h1>
          </div>
          <div className="flex gap-2.5">
            <Button variant="danger" icon={<Trash2 size={15} aria-hidden="true" />} onClick={onDelete}>Delete</Button>
            <Button icon={<X size={15} aria-hidden="true" />} onClick={onCancel}>Cancel</Button>
            <Button variant="primary" icon={<Check size={15} aria-hidden="true" />} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save collector'}
            </Button>
          </div>
        </div>
        {error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <SectionCard title="General" description="Name shown in the sidebar and on every Batch this Collector creates.">
          <FormField label="Name" value={config.name} onChange={(event) => setConfig({ ...config, name: event.target.value })} />
        </SectionCard>
        <SourceSection config={config} onChange={setConfig} onBrowseInput={() => setPicker('input')} />
        <FiltersSection config={config} onChange={setConfig} />
        <OutputSection config={config} onChange={setConfig} onBrowseOutput={() => setPicker('output')} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <FilterPreviewCard preview={filterPreview} />
        <PreviewPanel state={preview} outputFolder={config.outputFolder} />
      </div>
      {picker ? (
        <FolderPicker
          startPath={picker === 'input' ? config.inputFolder : config.outputFolder}
          onChoose={choose}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
