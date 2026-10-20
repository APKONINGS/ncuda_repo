"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/forms/Field";
import { cleanPhone } from "@/lib/phone";

/** A phone field that ignores letters as they are typed or pasted: digits, spaces, hyphens and a leading + only. */
export function PhoneInput(props: Omit<ComponentProps<"input">, "type">) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      onInput={(e) => {
        const el = e.currentTarget;
        const cleaned = cleanPhone(el.value);
        if (cleaned !== el.value) el.value = cleaned;
        props.onInput?.(e);
      }}
    />
  );
}
