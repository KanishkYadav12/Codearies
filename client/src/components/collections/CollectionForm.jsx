import { useForm } from '../../hooks/useForm';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { validateCollectionName } from '../../utils/validators';
import { COLLECTION_COLORS } from '../../constants';

export function CollectionForm({ initialValues, onSubmit, onCancel, submitLabel = 'Create collection' }) {
  const form = useForm(
    { name: '', description: '', color: COLLECTION_COLORS[0], ...initialValues },
    { name: validateCollectionName },
    (values) => onSubmit(values)
  );

  return (
    <form onSubmit={form.handleSubmit} className="space-y-4" noValidate>
      <Input label="Name" required placeholder="Git Survival Kit" {...form.field('name')} />

      <Input
        as="textarea"
        label="Description"
        rows={3}
        placeholder="What lives in this collection?"
        {...form.field('description')}
      />

      <div>
        <span className="mb-2 block text-sm font-medium text-ink-700 dark:text-slate-300">Colour</span>
        <div className="flex flex-wrap gap-2">
          {COLLECTION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => form.handleChange('color', color)}
              aria-label={`Choose colour ${color}`}
              aria-pressed={form.values.color === color}
              className="h-8 w-8 rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-ink-900"
              style={{
                backgroundColor: color,
                boxShadow: form.values.color === color ? `0 0 0 2px ${color}` : undefined
              }}
            />
          ))}
        </div>
      </div>

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

export default CollectionForm;
