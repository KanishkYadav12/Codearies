/**
 * Client-side validation.
 *
 * Frontend constraint #3 forbids form libraries, so there is no Yup/Zod schema
 * layer either — these are plain functions consumed by the `useForm` reducer.
 *
 * This is a *usability* layer, not a security one: the server re-validates
 * everything with Joi and its own custom validators. Duplicating the rules here
 * means a user sees "password is too short" as they type rather than after a
 * round trip.
 */

export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  DROP_TITLE_MAX: 100,
  DROP_CONTENT_MAX: 20000,
  DROP_TAGS_MAX: 5,
  TAG_MAX: 24,
  COLLECTION_NAME_MAX: 60,
  COLLECTION_DESCRIPTION_MAX: 200
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

/* ------------------------------------------------------------------ */
/* Field validators                                                    */
/*                                                                     */
/* Each returns an error string, or null when the value is acceptable. */
/* ------------------------------------------------------------------ */

export function validateUsername(value) {
  const username = (value || '').trim();

  if (!username) {
    return 'Username is required';
  }
  if (username.length < LIMITS.USERNAME_MIN) {
    return `At least ${LIMITS.USERNAME_MIN} characters`;
  }
  if (username.length > LIMITS.USERNAME_MAX) {
    return `At most ${LIMITS.USERNAME_MAX} characters`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Letters, numbers, dot, underscore or hyphen only';
  }

  return null;
}

export function validateEmail(value) {
  const email = (value || '').trim();

  if (!email) {
    return 'Email is required';
  }
  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address';
  }

  return null;
}

export function validatePassword(value) {
  const password = value || '';

  if (!password) {
    return 'Password is required';
  }
  if (password.length < LIMITS.PASSWORD_MIN) {
    return `At least ${LIMITS.PASSWORD_MIN} characters`;
  }
  if (password.length > LIMITS.PASSWORD_MAX) {
    return `At most ${LIMITS.PASSWORD_MAX} characters`;
  }

  return null;
}

export function validateConfirmPassword(value, allValues) {
  if (!value) {
    return 'Confirm your password';
  }
  if (value !== (allValues && allValues.password)) {
    return 'Passwords do not match';
  }

  return null;
}

export function validateRequired(label) {
  return (value) => ((value || '').trim() ? null : `${label} is required`);
}

export function validateDropTitle(value) {
  const title = (value || '').trim();

  if (!title) {
    return 'Give it a title';
  }
  if (title.length > LIMITS.DROP_TITLE_MAX) {
    return `At most ${LIMITS.DROP_TITLE_MAX} characters`;
  }

  return null;
}

export function validateDropContent(value) {
  const content = value || '';

  if (!content.trim()) {
    return 'Content cannot be empty';
  }
  if (content.length > LIMITS.DROP_CONTENT_MAX) {
    return `At most ${LIMITS.DROP_CONTENT_MAX.toLocaleString()} characters`;
  }

  return null;
}

export function validateCollectionName(value) {
  const name = (value || '').trim();

  if (!name) {
    return 'Name is required';
  }
  if (name.length > LIMITS.COLLECTION_NAME_MAX) {
    return `At most ${LIMITS.COLLECTION_NAME_MAX} characters`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Password strength                                                   */
/* ------------------------------------------------------------------ */

// Patterns that make a password weak regardless of its length.
const COMMON_PASSWORDS = [
  'password', '12345678', 'qwerty', 'letmein', 'welcome', 'admin123',
  'password1', 'iloveyou', 'abc12345', 'monkey', 'dragon', 'football'
];

/**
 * Real-time password strength for the register page.
 *
 * Scores length and character variety, then applies penalties for the things
 * that actually get passwords cracked — dictionary words, keyboard runs and
 * repeated characters — because "Passw0rd!" satisfies every naive variety check
 * while being trivially guessable.
 *
 * Returns `{ score 0-4, label, hint, percent }`.
 */
export function scorePassword(value) {
  const password = value || '';

  if (!password) {
    return { score: 0, label: 'Empty', hint: 'Use at least 8 characters', percent: 0 };
  }

  let score = 0;

  // Length is the single biggest factor.
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character variety.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password)
  ).length;

  if (classes >= 2) score += 1;
  if (classes >= 4) score += 1;

  const lowered = password.toLowerCase();

  // Penalties.
  if (COMMON_PASSWORDS.some((common) => lowered.includes(common))) {
    score -= 2;
  }
  if (/^(.)\1+$/.test(password)) {
    score -= 2;
  }
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
  }
  if (/(?:abc|123|qwe|asd|zxc)/i.test(password)) {
    score -= 1;
  }

  const bounded = Math.max(0, Math.min(4, score));

  const descriptors = [
    { label: 'Very weak', hint: 'Add length and variety' },
    { label: 'Weak', hint: 'Try 12+ characters' },
    { label: 'Fair', hint: 'Mix in symbols or numbers' },
    { label: 'Strong', hint: 'Good password' },
    { label: 'Excellent', hint: 'Excellent password' }
  ];

  return {
    score: bounded,
    label: descriptors[bounded].label,
    hint: password.length < LIMITS.PASSWORD_MIN
      ? `At least ${LIMITS.PASSWORD_MIN} characters`
      : descriptors[bounded].hint,
    percent: ((bounded + 1) / 5) * 100
  };
}

/** Runs a `{ field: validatorFn }` map over values, collecting errors. */
export function runValidators(values, validators) {
  const errors = {};

  Object.keys(validators).forEach((field) => {
    const error = validators[field](values[field], values);
    if (error) {
      errors[field] = error;
    }
  });

  return errors;
}
