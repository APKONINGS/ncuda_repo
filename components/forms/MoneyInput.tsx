"use client";

import { useRef, useState, type ComponentProps } from "react";
import { inputClasses } from "@/components/forms/Field";
import { cn } from "@/lib/utils";

const digitsOnly = (s: string) => s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const withSeparators = (digits: string) => (digits ? Number(digits).toLocaleString("en-GB") : "");

/**
 * A whole-franc amount box that shows thousand separators as you type
 * ("12,000") and submits the plain number ("12000") under `name`.
 * Uncontrolled (`defaultValue`) or controlled (`value` + `onValueChange`).
 */
export function MoneyInput({
  name,
  defaultValue,
  value,
  onValueChange,
  className,
  readOnly,
  ...rest
}: Omit<ComponentProps<"input">, "value" | "defaultValue" | "type" | "onChange"> & {
  name?: string;
  defaultValue?: string | number;
  /** Controlled value: plain digits. */
  value?: string;
  onValueChange?: (digits: string) => void;
}) {
  const [own, setOwn] = useState(() => digitsOnly(String(defaultValue ?? "")));
  const digits = value !== undefined ? digitsOnly(value) : own;
  const ref = useRef<HTMLInputElement>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    // Keep the caret after the same number of digits once separators are re-inserted.
    const caret = el.selectionStart ?? el.value.length;
    const digitsBeforeCaret = el.value.slice(0, caret).replace(/\D/g, "").length;
    const next = digitsOnly(el.value);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    requestAnimationFrame(() => {
      const input = ref.current;
      if (!input || document.activeElement !== input) return;
      let pos = 0;
      let seen = 0;
      while (pos < input.value.length && seen < digitsBeforeCaret) {
        if (/\d/.test(input.value[pos])) seen++;
        pos++;
      }
      input.setSelectionRange(pos, pos);
    });
  };

  return (
    <>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={withSeparators(digits)}
        onChange={onChange}
        readOnly={readOnly}
        className={cn(inputClasses, "num", className)}
        {...rest}
      />
      {name && <input type="hidden" name={name} value={digits} />}
    </>
  );
}
