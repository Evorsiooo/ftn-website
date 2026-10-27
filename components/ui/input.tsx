import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 transition placeholder:text-neutral-400 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
