/** Client-side checks for the sign-in form. The API validates again server-side. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value) => EMAIL_PATTERN.test(String(value).trim());

export function validateIdentifier(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'Enter your email or username.';
  if (trimmed.includes('@') && !isEmail(trimmed)) return 'That email address looks incomplete.';
  if (trimmed.length < 3) return 'Enter at least 3 characters.';
  return null;
}

export function validatePassword(value) {
  if (!value) return 'Enter your password.';
  if (value.length < 8) return 'Passwords are at least 8 characters.';
  return null;
}

export function validateLoginForm({ identifier, password }) {
  const errors = {};
  const identifierError = validateIdentifier(identifier);
  const passwordError = validatePassword(password);
  if (identifierError) errors.identifier = identifierError;
  if (passwordError) errors.password = passwordError;
  return errors;
}
