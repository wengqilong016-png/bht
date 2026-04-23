import type { ButtonHTMLAttributes } from 'react';

type AriaButtonOptions = {
  disabled?: boolean;
  label?: string; // maps to aria-label
  pressed?: boolean; // maps to aria-pressed
  expanded?: boolean; // maps to aria-expanded
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
};

/**
 * Hook that returns a complete set of button attributes for accessibility.
 * It guarantees:
 *   - type="button"
 *   - disabled syncs with aria-disabled
 *   - optional aria-label, aria-pressed, aria-expanded
 *   - focus-visible styling (Tailwind class used across the project)
 */
export const useAriaButton = (
  opts: AriaButtonOptions = {}
): ButtonHTMLAttributes<HTMLButtonElement> => {
  const {
    disabled,
    label,
    pressed,
    expanded,
    onClick,
    className,
  } = opts;

  return {
    type: 'button',
    disabled,
    'aria-disabled': disabled,
    ...(label && { 'aria-label': label }),
    ...(pressed !== undefined && { 'aria-pressed': pressed }),
    ...(expanded !== undefined && { 'aria-expanded': expanded }),
    onClick,
    className:
      `${className ?? ''} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500`.trim(),
  } as const;
};
