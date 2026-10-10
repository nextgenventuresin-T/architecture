import { forwardRef } from 'react';

const Input = forwardRef(function Input({ className = '', type = 'text', ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={`block w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:shadow-focus focus:outline-none disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-subtle ${className}`}
      {...props}
    />
  );
});

export default Input;
