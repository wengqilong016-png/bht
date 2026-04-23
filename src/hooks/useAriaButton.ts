import type { ButtonHTMLAttributes } from 'react';

type AriaButtonOptions = {
  disabled?: boolean;
  label?: string; // maps to aria-label
  pressed?: boolean; // maps to aria-pressed (for toggle buttons)
  expanded?: boolean; // maps to aria-expanded (for expandable buttons)
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  /**
   * Override the button type. Defaults to 'button'.
   * Use 'submit' for form submit buttons.
   */
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  /**
   * When true, includes the native `disabled` HTML attribute.
   * Use this for form submit buttons to prevent duplicate submissions.
   * When false (default), uses `aria-disabled` for semantic disabled state
   * while still allowing click handlers to run (useful for locked/informative buttons).
   */
  useNativeDisabled?: boolean;
};

/**
 * Hook that returns a complete set of button attributes for accessibility.
 * It guarantees:
 *   - appropriate type (defaults to 'button')
 *   - appropriate disabled handling (native or aria-based)
 *   - optional aria-label, aria-pressed, aria-expanded
 *   - focus-visible styling
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
    type = 'button',
    useNativeDisabled = false,
  } = opts;

  return {
    type,
    ...(disabled && useNativeDisabled && { disabled: true }),
    ...(disabled && !useNativeDisabled && { 'aria-disabled': true }),
    ...(label && { 'aria-label': label }),
    ...(pressed !== undefined && { 'aria-pressed': pressed }),
    ...(expanded !== undefined && { 'aria-expanded': expanded }),
    onClick,
    className:
      `${className ?? ''} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500`.trim(),
  } as const;
};
