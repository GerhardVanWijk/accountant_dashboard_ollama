/**
 * Financial number formatting utilities following patterns from installed
 * mdskills/financial-ui-patterns skill.
 *
 * Core principles:
 * - Always use `tabular-nums` CSS class to lock digit widths
 * - Use semantic color tokens (positive/negative) not raw colors
 * - Right-align numbers, left-align labels
 * - Show explicit +/- prefix on all values
 * - Pair color with icon/shape/position for accessibility
 * - Use mono fonts for tickers/IDs
 */

/**
 * Format a monetary amount with proper precision and sign.
 * Always use tabular-nums in component displaying this.
 *
 * @param value - The numeric value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with +/- prefix and decimals
 * @example
 * formatCurrency(1234.5) → "+1,234.50"
 * formatCurrency(-567.89) → "-567.89"
 */
export function formatCurrency(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${formatted}`;
}

/**
 * Format percentage with proper precision and sign.
 * Used for P&L, return on investment, growth rates.
 *
 * @param value - The percentage value (e.g., 12.5 for 12.5%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with +/- prefix and % suffix
 * @example
 * formatPercentage(12.5) → "+12.50%"
 * formatPercentage(-3.2) → "-3.20%"
 */
export function formatPercentage(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  const formatted = Math.abs(value).toFixed(decimals);
  return `${sign}${formatted}%`;
}

/**
 * Format a quantity with appropriate precision based on magnitude.
 * For accounting: fixed 2 decimals. For crypto-like: magnitude-aware.
 *
 * @param value - The quantity
 * @param type - 'accounting' (2 dp) or 'magnitude-aware' (auto-precision)
 * @returns Formatted string with right-alignment guidance
 */
export function formatQuantity(value: number, type: 'accounting' | 'magnitude-aware' = 'accounting'): string {
  if (type === 'accounting') {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Magnitude-aware: fewer decimals for large values
  if (Math.abs(value) >= 1000000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/**
 * Format large numbers in compact notation.
 * Used for revenue, expenses, market cap — NOT for prices/balances.
 *
 * @param value - The number
 * @param decimals - Decimal places in compact form (default: 1)
 * @returns Compact string like "1.2B", "847M"
 * @example
 * formatCompact(1234567890) → "1.2B"
 * formatCompact(847000000) → "847M"
 */
export function formatCompact(value: number, decimals = 1): string {
  const absValue = Math.abs(value);

  if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(decimals)}B`;
  }
  if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(decimals)}M`;
  }
  if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(decimals)}K`;
  }

  return value.toFixed(0);
}

/**
 * Determine semantic color token for a numeric value.
 * Returns class name to apply, e.g., "text-positive" or "text-negative"
 *
 * @param value - The numeric value
 * @param isInverted - If true, negative values get positive color (e.g., for expenses)
 * @returns Tailwind color class name: 'text-positive' or 'text-negative'
 */
export function getFinancialColorClass(value: number, isInverted = false): string {
  const isPositive = value >= 0;
  return isInverted ? (isPositive ? 'text-negative' : 'text-positive') : isPositive ? 'text-positive' : 'text-negative';
}

/**
 * Determine background flash color for tick update animation.
 * CSS-based animation via data-flash attribute, no JS animation.
 *
 * @param prevValue - Previous value
 * @param nextValue - New value
 * @returns Flash direction: 'up' | 'down' | null
 * @see See financial-ui-patterns SKILL.md for implementation
 */
export function getTickFlashDirection(prevValue: number, nextValue: number): 'up' | 'down' | null {
  if (prevValue === nextValue) return null;
  return nextValue > prevValue ? 'up' : 'down';
}

/**
 * Type for a formatted financial value with all metadata.
 * Useful for tables and structured displays.
 */
export interface FormattedFinancialValue {
  display: string;        // The formatted display string (with +/- sign)
  numeric: number;        // Original numeric value
  colorClass: string;     // Tailwind color class: 'text-positive' or 'text-negative'
  sign: '+' | '-' | '';   // Explicit sign
  isPositive: boolean;    // True if value >= 0
}

/**
 * Format a value into a complete financial object with metadata.
 * Use this when building table rows or card displays.
 *
 * @param value - Numeric value
 * @param formatter - Function to format the number (e.g., formatCurrency, formatPercentage)
 * @param isInverted - If true, negate color logic (for expenses, costs)
 * @returns Complete formatted financial value object
 */
export function formatFinancialValue(
  value: number,
  formatter: (n: number) => string = formatCurrency,
  isInverted = false,
): FormattedFinancialValue {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const display = formatter(value);
  const colorClass = getFinancialColorClass(value, isInverted);

  return {
    display,
    numeric: value,
    colorClass,
    sign: sign as '+' | '-' | '',
    isPositive: value >= 0,
  };
}

/**
 * Convenience: format as currency with full metadata
 */
export function formatCurrencyValue(value: number, isInverted = false): FormattedFinancialValue {
  return formatFinancialValue(value, formatCurrency, isInverted);
}

/**
 * Convenience: format as percentage with full metadata
 */
export function formatPercentageValue(value: number, isInverted = false): FormattedFinancialValue {
  return formatFinancialValue(value, formatPercentage, isInverted);
}
