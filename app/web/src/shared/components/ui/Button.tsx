import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'bg-fill-2 border-transparent text-base-content hover:bg-line',
  ghost: 'btn-ghost text-text-2',
  danger: 'bg-bad-soft border-transparent text-bad hover:bg-bad hover:text-white',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'secondary', icon, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-sm rounded-full font-semibold border-0 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
