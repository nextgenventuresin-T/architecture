import { forwardRef, useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { isoToDmy, dmyToIso } from '../../utils/format';

/**
 * Date entry shown and typed as DD-MM-YYYY, while the value it receives and emits
 * stays ISO "YYYY-MM-DD" - so every form, API payload and server validation that
 * already works with ISO dates is unchanged. The calendar button opens the
 * browser's own picker for anyone who prefers clicking a date.
 *
 * onChange is called with an event-like object ({ target: { name, value } }) so
 * existing `(e) => e.target.value` handlers work as-is. It fires with '' when the
 * field is cleared and with the ISO date once a complete, valid date is typed.
 */
const DateInput = forwardRef(function DateInput(
  { value, onChange, name, min, max, disabled, required, className = '', id, placeholder = 'DD-MM-YYYY', title, ...rest },
  ref
) {
  const iso = value ? String(value).slice(0, 10) : '';
  const [text, setText] = useState(isoToDmy(iso));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef(null);

  // Follow the value when it is changed from outside (another field, a reset).
  useEffect(() => {
    if (dmyToIso(text) !== iso) {
      setText(isoToDmy(iso));
      setInvalid(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const emit = (next) => onChange?.({ target: { name, value: next }, currentTarget: { name, value: next } });

  const handleText = (e) => {
    // Keep digits only and re-insert the dashes as the user types: 15112026 -> 15-11-2026.
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    const masked = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('-');
    setText(masked);
    if (!masked) {
      setInvalid(false);
      emit('');
      return;
    }
    const parsed = dmyToIso(masked);
    if (parsed) {
      const outOfRange = (min && parsed < String(min).slice(0, 10)) || (max && parsed > String(max).slice(0, 10));
      setInvalid(Boolean(outOfRange));
      emit(parsed);
    } else {
      setInvalid(digits.length === 8);
    }
  };

  const handleBlur = () => {
    // An incomplete entry snaps back to the last valid date.
    if (text && !dmyToIso(text)) {
      setText(isoToDmy(iso));
      setInvalid(false);
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  // Width classes size the wrapper (the input always fills it); the rest style the input.
  const tokens = String(className).split(/\s+/).filter(Boolean);
  const widthTokens = tokens.filter((c) => /^(w-|min-w-|max-w-|flex-|shrink|grow|basis-)/.test(c));
  const inputTokens = tokens.filter((c) => !widthTokens.includes(c));

  return (
    <div className={`relative ${widthTokens.length ? widthTokens.join(' ') : 'w-full'}`}>
      <input
        {...rest}
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name={name}
        value={text}
        onChange={handleText}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        title={title || 'Date (DD-MM-YYYY)'}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        className={`${inputTokens.join(' ')} w-full pr-9 ${invalid ? 'border-danger' : ''}`}
        maxLength={10}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-subtle hover:text-brand-700 disabled:cursor-not-allowed"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Native picker, used only for its calendar popup. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={iso}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => emit(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </div>
  );
});

export default DateInput;
