/**
 * FinancialNumber component — displays numbers following financial UI patterns.
 *
 * Features:
 * - Always uses `tabular-nums` to lock digit widths (no reflow on update)
 * - Semantic color tokens (text-positive / text-negative)
 * - Explicit +/- sign prefix
 * - Right-aligned for table context
 * - Tick-flash animation on value change (CSS-based)
 * - Accessibility: pairs color with explicit sign, not color-only
 *
 * See: mdskills/financial-ui-patterns SKILL.md
 */

import React, { useEffect, useRef, useState } from 'react';
import { getTickFlashDirection } from '../../utils/formatFinancial';

interface FinancialNumberProps {
  /** Numeric value to display */
  value: number;

  /** Function to format the number (e.g., formatCurrency, formatPercentage) */
  format: (n: number) => string;

  /** If true, invert color logic (e.g., for expenses: negative = bad) */
  isInverted?: boolean;

  /** Minimum width for alignment (default: auto) */
  minWidth?: string | number;

  /** CSS class names to apply */
  className?: string;

  /** Show tick-flash animation on value change (default: true) */
  showFlash?: boolean;

  /** Additional aria-label for accessibility */
  ariaLabel?: string;
}

/**
 * Renders a single financial number with semantic coloring and tabular formatting.
 * Use in tables, cards, dashboard widgets displaying prices, P&L, quantities.
 *
 * @example
 * // Currency with flash
 * <FinancialNumber value={1234.56} format={formatCurrency} minWidth={100} />
 *
 * // Percentage without flash
 * <FinancialNumber value={-3.2} format={formatPercentage} showFlash={false} />
 *
 * // Expense (inverted: negative is bad)
 * <FinancialNumber value={-500} format={formatCurrency} isInverted />
 */
export const FinancialNumber = React.memo(
  ({
    value,
    format,
    isInverted = false,
    minWidth,
    className = '',
    showFlash = true,
    ariaLabel,
  }: FinancialNumberProps) => {
    const prevValue = useRef(value);
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);

    // Tick-flash animation on value change
    useEffect(() => {
      if (!showFlash || value === prevValue.current) return;

      const direction = getTickFlashDirection(prevValue.current, value);
      if (!direction) return;

      setFlash(direction);
      prevValue.current = value;

      const timeout = setTimeout(() => setFlash(null), 400);
      return () => clearTimeout(timeout);
    }, [value, showFlash]);

    // Determine color based on value and inversion
    const isPositive = value >= 0;
    const colorClass = isInverted ? (isPositive ? 'text-negative' : 'text-positive') : isPositive ? 'text-positive' : 'text-negative';

    // Flash background class
    const flashClass = flash === 'up' ? 'data-[flash=up]:bg-positive/15' : flash === 'down' ? 'data-[flash=down]:bg-negative/15' : '';

    const style = minWidth ? { minWidth } : undefined;

    return (
      <span
        data-flash={flash ?? undefined}
        className={`
          tabular-nums tracking-tight transition-colors duration-300
          ${colorClass}
          ${flashClass}
          px-1 rounded-sm
          ${className}
        `}
        style={style}
        role="text"
        aria-label={ariaLabel}
      >
        {format(value)}
      </span>
    );
  },
);

FinancialNumber.displayName = 'FinancialNumber';
