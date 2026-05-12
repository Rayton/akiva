import React, { ReactNode } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const baseClasses = 'min-h-11 font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-akiva-accent focus:ring-offset-2 focus:ring-offset-akiva-bg';
  
  const variantClasses = {
    primary: 'bg-akiva-accent text-white hover:bg-akiva-accent-strong disabled:bg-akiva-accent-soft disabled:text-akiva-text-muted',
    secondary: 'border border-akiva-border bg-akiva-surface-muted text-akiva-text hover:bg-akiva-surface-raised disabled:bg-akiva-surface disabled:text-akiva-text-muted',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-200 disabled:text-red-900 dark:disabled:bg-red-950 dark:disabled:text-red-200',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-200 disabled:text-emerald-900 dark:disabled:bg-emerald-950 dark:disabled:text-emerald-200'
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
