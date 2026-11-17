import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
  error?: string;
  icon?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function FormField({ label, helper, error, icon, id, className = '', ...rest }: FormFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const message = error ?? helper;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="font-sans text-caption font-semibold text-text-2">
        {label}
      </label>
      <div className="relative flex items-center">
        {icon ? <span className="pointer-events-none absolute left-3 z-10 text-text-2">{icon}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`input input-sm w-full rounded-[10px] border-0 bg-fill-2 px-3 text-body focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 ${icon ? 'pl-9' : ''} ${error ? 'ring-2 ring-bad/50' : ''}`}
          {...rest}
        />
      </div>
      {message ? <p className={`font-sans text-caption ${error ? 'text-bad' : 'text-text-3'}`}>{message}</p> : null}
    </div>
  );
}
