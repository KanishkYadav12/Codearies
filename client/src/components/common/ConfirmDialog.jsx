import { Modal } from './Modal';
import { Button } from './Button';

/**
 * Confirmation dialog for destructive actions (delete a drop, delete a
 * collection, bulk-delete). Every destructive control in the app routes
 * through this rather than firing on a bare click.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">Confirm this action to proceed, or cancel to go back.</span>
    </Modal>
  );
}

export default ConfirmDialog;
