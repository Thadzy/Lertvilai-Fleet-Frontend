/**
 * @file NumericInput.tsx
 * @description Robust numeric input component that solves the React controlled-input problem.
 *
 * Problem with native <input type="number" value={num} onChange={e => setNum(parse(e))}>:
 *   - Typing "-"      → parseFloat("-")  = NaN → resets to 0 → minus sign disappears
 *   - Typing "1."     → parseFloat("1.") = 1   → strips decimal point → can't type "1.5"
 *   - Typing "-0.0"   → collapses immediately → can't enter negative decimals
 *
 * Solution:
 *   - Keep an internal string "draft" while the user is typing.
 *   - Only commit (parse + clamp + call onChange) on blur or Enter.
 *   - ArrowUp / ArrowDown increment/decrement by `step` and commit immediately.
 *   - Sync the draft from the external `value` prop only when the input is not focused.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
  > {
  /** Current numeric value (controlled by the parent). */
  value: number;
  /**
   * Called every time the value is committed (on blur or Enter).
   * Also called immediately on ArrowUp / ArrowDown.
   */
  onChange: (value: number) => void;
  /** Minimum value — clamped on commit. */
  min?: number;
  /** Maximum value — clamped on commit. */
  max?: number;
  /**
   * Step size for ArrowUp / ArrowDown keyboard keys.
   * @default 1
   */
  step?: number;
  /**
   * Fixed number of decimal places to show when formatting the committed value.
   * Leave undefined for automatic formatting (no trailing zeros).
   */
  decimals?: number;
  /**
   * If true, the value is treated as an integer (floor on commit, inputMode="numeric").
   * Takes precedence over `decimals`.
   */
  integer?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number, decimals?: number, integer?: boolean): string {
  if (!isFinite(v)) return '';
  if (integer) return String(Math.round(v));
  if (decimals !== undefined) return v.toFixed(decimals);
  return String(v);
}

function clamp(v: number, min?: number, max?: number): number {
  let result = v;
  if (min !== undefined && isFinite(min)) result = Math.max(min, result);
  if (max !== undefined && isFinite(max)) result = Math.min(max, result);
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      decimals,
      integer = false,
      className,
      onFocus,
      onBlur,
      onKeyDown,
      ...rest
    },
    ref,
  ) => {
    // ── Internal string draft ──────────────────────────────────────────────
    const [draft, setDraft] = useState<string>(() =>
      formatValue(value, decimals, integer),
    );
    const focused = useRef(false);

    // Sync external value → draft only when the input is not being edited
    useEffect(() => {
      if (!focused.current) {
        setDraft(formatValue(value, decimals, integer));
      }
    }, [value, decimals, integer]);

    // ── Commit helper ──────────────────────────────────────────────────────
    const commit = useCallback(
      (raw: string) => {
        const parsed = parseFloat(raw);
        if (isNaN(parsed)) {
          // Invalid — snap back to the last known good value from the parent
          setDraft(formatValue(value, decimals, integer));
          return;
        }
        const processed = integer ? Math.round(parsed) : parsed;
        const clamped = clamp(processed, min, max);
        setDraft(formatValue(clamped, decimals, integer));
        onChange(clamped);
      },
      [value, min, max, decimals, integer, onChange],
    );

    // ── Event handlers ─────────────────────────────────────────────────────

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Allow any intermediate text ("-", "1.", "-.5") without committing
      setDraft(e.target.value);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      focused.current = true;
      // Select all text on focus for easy replacement
      e.target.select();
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      focused.current = false;
      commit(draft);
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        // Blur triggers commit
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Custom step — prevents browser from interfering with type="text"
        e.preventDefault();
        const current = parseFloat(draft);
        const base = isNaN(current) ? value : current;
        const effectiveStep = step ?? 1;
        const delta = e.key === 'ArrowUp' ? effectiveStep : -effectiveStep;
        const newVal = clamp(
          integer ? Math.round(base + delta) : base + delta,
          min,
          max,
        );
        const formatted = formatValue(newVal, decimals, integer);
        setDraft(formatted);
        onChange(newVal);
      }
      onKeyDown?.(e);
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
      <input
        ref={ref}
        // Use "text" type to prevent browser from mangling intermediate values.
        // inputMode tells mobile devices which keyboard to show.
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        {...rest}
      />
    );
  },
);

NumericInput.displayName = 'NumericInput';
export default NumericInput;
