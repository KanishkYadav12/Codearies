import { useCallback, useMemo, useReducer, useRef } from 'react';

/**
 * Form state management built on `useReducer`.
 *
 * Frontend constraint #3: no Formik, no React Hook Form — and the spec names
 * `useReducer` specifically. That is the right primitive anyway: a form has
 * several interdependent pieces of state (values, errors, touched, submitting)
 * that must move together, and coordinating four `useState` calls invites the
 * classic bug where an error clears a render after the value it described.
 *
 * Validation strategy is the part that actually determines how a form *feels*:
 *
 *   - a field validates on **blur**, not on every keystroke — flagging
 *     "invalid email" while someone is still typing the domain is hostile
 *   - once a field has an error it re-validates on **change**, so the message
 *     disappears the moment it is fixed rather than waiting for another blur
 *   - submit validates everything and marks all fields touched, so nothing
 *     stays silently invalid
 */

const CHANGE = 'CHANGE';
const BLUR = 'BLUR';
const SET_ERRORS = 'SET_ERRORS';
const SET_VALUES = 'SET_VALUES';
const SUBMIT_START = 'SUBMIT_START';
const SUBMIT_END = 'SUBMIT_END';
const RESET = 'RESET';

function formReducer(state, action) {
  switch (action.type) {
    case CHANGE: {
      const { field, value } = action;
      const values = { ...state.values, [field]: value };

      // Only re-validate a field that is already showing an error, so the
      // message clears as soon as the input becomes valid.
      let errors = state.errors;

      if (state.errors[field] && action.validator) {
        const error = action.validator(value, values);
        errors = { ...state.errors };

        if (error) {
          errors[field] = error;
        } else {
          delete errors[field];
        }
      }

      return { ...state, values, errors, submitError: null };
    }

    case BLUR: {
      const { field } = action;
      const touched = { ...state.touched, [field]: true };

      if (!action.validator) {
        return { ...state, touched };
      }

      const error = action.validator(state.values[field], state.values);
      const errors = { ...state.errors };

      if (error) {
        errors[field] = error;
      } else {
        delete errors[field];
      }

      return { ...state, touched, errors };
    }

    case SET_VALUES:
      return { ...state, values: { ...state.values, ...action.values } };

    case SET_ERRORS:
      return {
        ...state,
        errors: action.errors,
        // Server-side errors must be visible immediately, so mark the fields
        // they name as touched.
        touched: { ...state.touched, ...action.touched },
        submitError: action.submitError !== undefined ? action.submitError : state.submitError
      };

    case SUBMIT_START:
      return {
        ...state,
        submitting: true,
        submitError: null,
        errors: action.errors,
        touched: action.touched
      };

    case SUBMIT_END:
      return { ...state, submitting: false, submitError: action.submitError || null };

    case RESET:
      return {
        values: action.values,
        errors: {},
        touched: {},
        submitting: false,
        submitError: null
      };

    default:
      return state;
  }
}

/**
 * @param {object} initialValues
 * @param {object} validators   `{ field: (value, allValues) => error|null }`
 * @param {Function} onSubmit   receives validated values; may be async
 */
export function useForm(initialValues, validators = {}, onSubmit) {
  const initialRef = useRef(initialValues);

  const [state, dispatch] = useReducer(formReducer, {
    values: initialValues,
    errors: {},
    touched: {},
    submitting: false,
    submitError: null
  });

  // Refs so the returned handlers stay referentially stable across renders —
  // otherwise every input re-renders on every keystroke.
  const validatorsRef = useRef(validators);
  validatorsRef.current = validators;

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const handleChange = useCallback((field, value) => {
    dispatch({ type: CHANGE, field, value, validator: validatorsRef.current[field] });
  }, []);

  const handleBlur = useCallback((field) => {
    dispatch({ type: BLUR, field, validator: validatorsRef.current[field] });
  }, []);

  const setValues = useCallback((values) => {
    dispatch({ type: SET_VALUES, values });
  }, []);

  const setErrors = useCallback((errors, submitError) => {
    const touched = {};
    Object.keys(errors || {}).forEach((field) => {
      touched[field] = true;
    });

    dispatch({ type: SET_ERRORS, errors: errors || {}, touched, submitError });
  }, []);

  const reset = useCallback((values) => {
    dispatch({ type: RESET, values: values || initialRef.current });
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const handleSubmit = useCallback((event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const { values } = stateRef.current;
    const activeValidators = validatorsRef.current;

    // Validate everything and mark all fields touched.
    const errors = {};
    const touched = {};

    Object.keys(activeValidators).forEach((fieldName) => {
      touched[fieldName] = true;
      const error = activeValidators[fieldName](values[fieldName], values);
      if (error) {
        errors[fieldName] = error;
      }
    });

    dispatch({ type: SUBMIT_START, errors, touched });

    if (Object.keys(errors).length) {
      dispatch({ type: SUBMIT_END });

      // Move focus to the first invalid field — without this, a long form can
      // fail validation entirely off-screen and look like nothing happened.
      const firstInvalid = Object.keys(activeValidators).find((fieldName) => errors[fieldName]);
      if (firstInvalid && typeof document !== 'undefined') {
        const element = document.querySelector(`[name="${firstInvalid}"]`);
        if (element && typeof element.focus === 'function') {
          element.focus();
        }
      }

      return Promise.resolve({ ok: false, errors });
    }

    return Promise.resolve()
      .then(() => onSubmitRef.current(values))
      .then((result) => {
        dispatch({ type: SUBMIT_END });
        return { ok: true, result };
      })
      .catch((error) => {
        // Field-level errors from the API's 422 payload are mapped back onto
        // the matching inputs; anything else becomes a form-level message.
        const details = error && error.data && error.data.error && error.data.error.details;

        if (Array.isArray(details) && details.length) {
          const fieldErrors = {};
          const fieldTouched = {};

          details.forEach((detail) => {
            if (detail.field) {
              fieldErrors[detail.field] = detail.message;
              fieldTouched[detail.field] = true;
            }
          });

          if (Object.keys(fieldErrors).length) {
            dispatch({
              type: SET_ERRORS,
              errors: fieldErrors,
              touched: fieldTouched,
              submitError: null
            });
            dispatch({ type: SUBMIT_END });
            return { ok: false, errors: fieldErrors };
          }
        }

        const message =
          (error && error.data && error.data.error && error.data.error.message) ||
          (error && error.message) ||
          'Something went wrong. Try again.';

        dispatch({ type: SUBMIT_END, submitError: message });
        return { ok: false, submitError: message };
      });
  }, []);

  /** Spreadable props for a controlled input: `<Input {...field('email')} />` */
  const field = useCallback(
    (name) => ({
      name,
      value: state.values[name] === undefined ? '' : state.values[name],
      onChange: (event) => {
        const value =
          event && event.target
            ? event.target.type === 'checkbox'
              ? event.target.checked
              : event.target.value
            : event;
        handleChange(name, value);
      },
      onBlur: () => handleBlur(name),
      // Only surface an error once the field has been interacted with.
      error: state.touched[name] ? state.errors[name] : null
    }),
    [state.values, state.touched, state.errors, handleChange, handleBlur]
  );

  const isValid = useMemo(() => Object.keys(state.errors).length === 0, [state.errors]);

  const isDirty = useMemo(
    () =>
      Object.keys(state.values).some((key) => state.values[key] !== initialRef.current[key]),
    [state.values]
  );

  return {
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    submitting: state.submitting,
    submitError: state.submitError,
    isValid,
    isDirty,
    field,
    handleChange,
    handleBlur,
    handleSubmit,
    setValues,
    setErrors,
    reset
  };
}

export default useForm;
