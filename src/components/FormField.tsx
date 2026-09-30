"use client";

import { Field } from "@chakra-ui/react";

type FormFieldProps = {
  label: string;
  required?: boolean;
  /** Shown when there is no error. */
  helperText?: string;
  /** Presence of a message puts the field into its invalid state. */
  error?: string;
  children: React.ReactNode;
};

/**
 * Label + control + helper/error text, composed once.
 *
 * Chakra v3 replaced v2's `FormControl` with the `Field` namespace; wrapping it
 * here keeps that detail in one file and guarantees every field in the app
 * announces itself to assistive technology the same way.
 */
export function FormField({
  label,
  required = false,
  helperText,
  error,
  children,
}: FormFieldProps) {
  return (
    <Field.Root required={required} invalid={Boolean(error)}>
      <Field.Label fontWeight="medium">
        {label}
        {required && <Field.RequiredIndicator />}
      </Field.Label>

      {children}

      {/* Helper text is suppressed while an error is showing, so the engineer
          is never reading advice and a correction at the same time. */}
      {error ? (
        <Field.ErrorText>{error}</Field.ErrorText>
      ) : (
        helperText && <Field.HelperText>{helperText}</Field.HelperText>
      )}
    </Field.Root>
  );
}
