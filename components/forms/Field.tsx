import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClasses =
  "block w-full rounded-[var(--radius-sm)] border border-line-strong bg-paper px-4 py-3 text-[0.9375rem] text-ink-900 placeholder:text-ink-300 transition-[border-color,box-shadow] duration-200 hover:border-ink-300 focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-forest-700/15 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:bg-cream disabled:text-ink-500";

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-ink-900">
        {label}
        {optional && <span className="text-xs font-normal text-ink-500">Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs font-medium text-danger" role="alert">
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
            <path d="M6 0 12 6 6 12 0 6Z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClasses, "min-h-40 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClasses, "appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%23625b51' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

/** Builds aria props for an input wired to <Field>. */
export function fieldAria(id: string, error?: string, hint?: boolean) {
  return {
    id,
    name: id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/** Styled native file picker. `accept` defaults to the portal's supported document types. */
export function FileInput({
  invalid,
  className,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp",
  ...props
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      type="file"
      accept={accept}
      aria-invalid={invalid || undefined}
      aria-describedby={props.id ? (invalid ? `${props.id}-error` : `${props.id}-hint`) : undefined}
      className={cn(
        "block w-full rounded-[var(--radius-sm)] border border-dashed border-line-strong bg-paper px-3 py-3 text-sm text-ink-700",
        "file:mr-4 file:cursor-pointer file:rounded-[var(--radius-xs)] file:border-0 file:bg-forest-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-paper hover:file:bg-forest-900",
        "focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-forest-700/15 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
