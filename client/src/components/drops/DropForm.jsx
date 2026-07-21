import { useMemo, useState } from 'react';

import { useForm } from '../../hooks/useForm';
import { useDebounce } from '../../hooks/useDebounce';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { Checkbox } from '../common/Checkbox';
import { DropTypeBadge } from './DropTypeBadge';
import { TagChip } from './TagChip';
import {
  validateDropContent,
  validateDropTitle,
  LIMITS
} from '../../utils/validators';
import { previewCategorization } from '../../utils/tagExtractor';
import { DROP_TYPES } from '../../constants';
import { useGetCollectionsQuery } from '../../store/api/apiSlice';

const TYPE_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  ...DROP_TYPES.map((type) => ({ value: type, label: type[0].toUpperCase() + type.slice(1) }))
];

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' }
];

/**
 * Create/edit form for a drop.
 *
 * Built entirely on `useForm` (frontend constraint #3 — no Formik/RHF) and
 * shows a live preview of what the server's auto-categorisation will do,
 * computed by the client-side mirror in `tagExtractor.js`. The preview is
 * debounced so it does not re-run the regex sweep on every keystroke of a long
 * paste.
 */
export function DropForm({ initialValues, onSubmit, submitLabel = 'Create drop', onCancel }) {
  const { data: collections } = useGetCollectionsQuery();
  const [manualTags, setManualTags] = useState(initialValues?.tags?.length ? true : false);
  const [tagInput, setTagInput] = useState('');

  const form = useForm(
    {
      title: '',
      content: '',
      type: '',
      language: '',
      tags: [],
      visibility: 'private',
      collectionId: '',
      ...initialValues
    },
    {
      title: validateDropTitle,
      content: validateDropContent
    },
    (values) => {
      const payload = {
        title: values.title.trim(),
        content: values.content,
        visibility: values.visibility
      };

      if (values.type) payload.type = values.type;
      if (values.language) payload.language = values.language;
      if (manualTags && values.tags.length) payload.tags = values.tags;
      if (values.collectionId) payload.collectionId = values.collectionId;

      return onSubmit(payload);
    }
  );

  const debouncedContent = useDebounce(form.values.content, 250);
  const debouncedTitle = useDebounce(form.values.title, 250);

  const preview = useMemo(
    () =>
      previewCategorization({
        title: debouncedTitle,
        content: debouncedContent,
        type: form.values.type || undefined,
        language: form.values.language || undefined
      }),
    [debouncedTitle, debouncedContent, form.values.type, form.values.language]
  );

  const displayedTags = manualTags ? form.values.tags : preview.tags;

  const addTag = (event) => {
    event.preventDefault();
    const cleaned = tagInput.trim().toLowerCase().replace(/^#/, '');

    if (!cleaned || form.values.tags.includes(cleaned) || form.values.tags.length >= LIMITS.DROP_TAGS_MAX) {
      setTagInput('');
      return;
    }

    form.setValues({ tags: [...form.values.tags, cleaned] });
    setManualTags(true);
    setTagInput('');
  };

  const removeTag = (tag) => {
    form.setValues({ tags: form.values.tags.filter((item) => item !== tag) });
  };

  return (
    <form onSubmit={form.handleSubmit} className="space-y-4" noValidate>
      <Input label="Title" required placeholder="What are you saving?" {...form.field('title')} />

      <Input
        as="textarea"
        label="Content"
        required
        rows={8}
        placeholder={
          'Paste a snippet, a command, a link, or write a note.\n\nUse ```lang blocks for code — type and language are detected automatically.'
        }
        className="font-mono text-[13px]"
        {...form.field('content')}
      />

      <div className="flex items-center justify-between text-xs text-ink-500 dark:text-slate-500">
        <span>
          {form.values.content.length.toLocaleString()} / {LIMITS.DROP_CONTENT_MAX.toLocaleString()}
        </span>
        <span className="flex items-center gap-1.5">
          Detected as <DropTypeBadge type={form.values.type || preview.type} />
          {preview.language && !form.values.type && (
            <span className="font-mono">· {preview.language}</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type override"
          options={TYPE_OPTIONS}
          {...form.field('type')}
        />
        <Select
          label="Visibility"
          options={VISIBILITY_OPTIONS}
          {...form.field('visibility')}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700 dark:text-slate-300">Tags</span>
          {!manualTags && (
            <span className="text-xs text-ink-400 dark:text-slate-500">Auto-detected — edit to override</span>
          )}
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {displayedTags.length === 0 && (
            <span className="text-xs text-ink-400 dark:text-slate-500">No tags yet</span>
          )}
          {displayedTags.map((tag) => (
            <TagChip key={tag} tag={tag} onRemove={manualTags ? removeTag : undefined} />
          ))}
        </div>

        {form.values.tags.length < LIMITS.DROP_TAGS_MAX && (
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addTag(event);
              }}
              placeholder="Add a custom tag…"
              className="input-base flex-1 text-sm"
              maxLength={24}
            />
            <Button type="button" variant="outline" size="md" onClick={addTag}>
              Add
            </Button>
          </div>
        )}
      </div>

      {collections?.length > 0 && (
        <Select
          label="Add to collection"
          placeholder="None"
          options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
          {...form.field('collectionId')}
        />
      )}

      {form.submitError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {form.submitError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={form.submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default DropForm;
