"use client";

import {
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
} from "@chakra-ui/react";

/**
 * Generated with `chakra snippet add toaster`, then adjusted: brand-coloured
 * spinner, and hidden from print output.
 */

export const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
});

/** Every failure the engineer needs to see goes through here, so error
 *  presentation is consistent and no component invents its own banner. */
export function notifyError(title: string, error?: unknown) {
  toaster.create({
    type: "error",
    title,
    description:
      error instanceof Error && error.message !== title
        ? error.message
        : undefined,
    duration: 8000,
    closable: true,
  });
}

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster
        toaster={toaster}
        insetInline={{ mdDown: "4" }}
        data-print="hide"
      >
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            {toast.type === "loading" ? (
              <Spinner size="sm" color="brand.solid" />
            ) : (
              <Toast.Indicator />
            )}
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && (
                <Toast.Description>{toast.description}</Toast.Description>
              )}
            </Stack>
            {toast.action && (
              <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
            )}
            {toast.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
};
