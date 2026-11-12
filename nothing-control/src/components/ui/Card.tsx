import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'interactive';
}

export const Card = ({ className, variant = 'default', children, ...props }: CardProps) => {
  const variants = {
    default: 'bg-bg-elevated border border-border rounded-lg shadow-sm',
    hover: 'bg-bg-elevated border border-border rounded-lg shadow-sm hover:shadow-md hover:border-accent/50 transition-all duration-150',
    interactive: 'bg-bg-elevated border border-border rounded-lg shadow-sm hover:shadow-md hover:border-accent/50 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  };
  
  return (
    <div className={twMerge(clsx(variants[variant], className))} {...props}>
      {children}
    </div>
  );
};

export const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('px-4 py-3 border-b border-border', className)} {...props}>
    {children}
  </div>
);

export const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('px-4 py-3', className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('px-4 py-3 border-t border-border bg-surface/50 rounded-b-lg', className)} {...props}>
    {children}
  </div>
);