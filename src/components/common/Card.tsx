import React, { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ title, children, className = '', padding = true }: CardProps) {
  return (
    <div className={`rounded-lg border border-akiva-border bg-akiva-surface-raised text-akiva-text shadow-sm ${className}`}>
      {title && (
        <div className="border-b border-akiva-border px-6 py-4">
          <h3 className="text-lg font-semibold text-akiva-text">{title}</h3>
        </div>
      )}
      <div className={padding ? 'p-6' : ''}>
        {children}
      </div>
    </div>
  );
}
