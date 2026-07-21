import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { Modal } from '../common/Modal';
import { DropForm } from '../drops/DropForm';
import { selectCreateDropOpen, setCreateDropOpen, pushToast } from '../../store/slices/uiSlice';
import { useCreateDropMutation } from '../../store/api/apiSlice';

/**
 * The floating-action "quick create" modal — reachable from the dashboard's FAB,
 * the command palette, and the global Ctrl/Cmd+N shortcut, so it lives once at
 * the app shell level rather than being re-mounted per page.
 */
export function CreateDropModal() {
  const open = useSelector(selectCreateDropOpen);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [createDrop] = useCreateDropMutation();

  const close = () => dispatch(setCreateDropOpen(false));

  return (
    <Modal open={open} onClose={close} title="Capture a new drop" size="lg">
      <DropForm
        submitLabel="Create drop"
        onCancel={close}
        onSubmit={(payload) =>
          createDrop(payload)
            .unwrap()
            .then((drop) => {
              dispatch(pushToast('Drop captured', 'success'));
              close();
              navigate(`/drops/${drop.id}`);
            })
        }
      />
    </Modal>
  );
}

export default CreateDropModal;
