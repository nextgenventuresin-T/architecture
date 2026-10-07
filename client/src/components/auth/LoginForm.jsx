import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import TextField from '../ui/TextField';
import Checkbox from '../ui/Checkbox';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import useAuth from '../../hooks/useAuth';
import { validateLoginForm } from '../../utils/validators';
import { getRememberedIdentifier } from '../../utils/storage';
import { resolveHomeRoute } from '../../config/roles';

export default function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const remembered = getRememberedIdentifier();
  const [values, setValues] = useState({
    identifier: remembered,
    password: '',
    remember: Boolean(remembered),
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (event) => {
    const value = field === 'remember' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    // Clear the message for a field as soon as the user starts correcting it.
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    const errors = validateLoginForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const result = await login({
      identifier: values.identifier.trim(),
      password: values.password,
      remember: values.remember,
    });

    if (result.ok) {
      // Return the user to the page they were trying to reach, or to the
      // dashboard mapped to their role.
      const intended = location.state?.from;
      navigate(intended || resolveHomeRoute(result.user.role), { replace: true });
      return;
    }

    setIsSubmitting(false);
    if (result.error.details) setFieldErrors(result.error.details);
    setFormError(result.error);
    setValues((current) => ({ ...current, password: '' }));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <Alert tone="error" title={errorTitle(formError.code)}>
          {formError.message}
        </Alert>
      )}

      <TextField
        label="Email or username"
        name="identifier"
        type="text"
        icon={Mail}
        autoComplete="username"
        placeholder="you@company.com"
        value={values.identifier}
        onChange={handleChange('identifier')}
        error={fieldErrors.identifier}
        disabled={isSubmitting}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        icon={Lock}
        autoComplete="current-password"
        placeholder="Enter your password"
        value={values.password}
        onChange={handleChange('password')}
        error={fieldErrors.password}
        disabled={isSubmitting}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          label="Keep me signed in"
          checked={values.remember}
          onChange={handleChange('remember')}
          disabled={isSubmitting}
        />
        <Link
          to="/forgot-password"
          className="rounded text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} loadingText="Signing in…">
        Sign in
      </Button>
    </form>
  );
}

function errorTitle(code) {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Sign-in failed';
    case 'ACCOUNT_LOCKED':
      return 'Account temporarily locked';
    case 'RATE_LIMITED':
      return 'Too many attempts';
    case 'FORBIDDEN':
      return 'Account unavailable';
    case 'NETWORK':
    case 'TIMEOUT':
      return 'Connection problem';
    default:
      return 'Check your details';
  }
}
