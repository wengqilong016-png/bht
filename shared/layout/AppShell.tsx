import React from 'react';

interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Root layout container for both admin and driver shells.
 * Provides the flex h-screen base structure.
 */
const AppShell: React.FC<AppShellProps> = ({ children, className, ...rest }) => (
  <div className={['flex h-screen overflow-hidden bg-slate-100', className].filter(Boolean).join(' ')} {...rest}>
    {children}
  </div>
);

export default AppShell;
