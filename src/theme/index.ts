import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * ParkhillCXField design system.
 *
 * This is the ONLY file in the repository where a brand colour is written.
 * Everything else refers to it through `colorPalette="brand"` or the
 * `brand.*` tokens, so re-branding is a change to the scale below and
 * nothing more.
 */

const config = defineConfig({
  globalCss: {
    "html, body": {
      bg: "white",
      color: "fg",
    },
    body: {
      // Prevents a horizontal scrollbar from appearing on mobile if any single
      // element misbehaves; the layouts themselves never produce overflow.
      overflowX: "hidden",
    },
    // The mobile font-size floor and the print rules live in
    // `src/app/globals.css` - they are media-query-scoped raw selectors, which
    // read better as plain CSS than as a nested style object.
  },

  theme: {
    tokens: {
      colors: {
        /**
         * TODO: replace with the official Parkhill red.
         *
         * `brand.500` is the primary accent (buttons, active states, report
         * rules); 600/700 are its hover and pressed states; 50/100 are the
         * subtle tints used for selected rows and banners. Swap these eleven
         * values and the whole application re-brands.
         */
        brand: {
          50: { value: "#fef2f3" },
          100: { value: "#fde3e5" },
          200: { value: "#fbccd1" },
          300: { value: "#f7a5ae" },
          400: { value: "#f17385" },
          500: { value: "#c8102e" },
          600: { value: "#a80d26" },
          700: { value: "#8c0c20" },
          800: { value: "#75101f" },
          900: { value: "#63111f" },
          950: { value: "#37040c" },
        },
      },
      fonts: {
        heading: {
          value:
            "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        body: {
          value:
            "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
      },
    },

    semanticTokens: {
      colors: {
        /**
         * All seven of these keys are mandatory in Chakra v3 for
         * `colorPalette="brand"` to resolve on Button, Checkbox, Steps, etc.
         * Omitting any one of them silently breaks that component's colours.
         */
        brand: {
          solid: { value: "{colors.brand.500}" },
          contrast: { value: "white" },
          fg: { value: "{colors.brand.700}" },
          muted: { value: "{colors.brand.50}" },
          subtle: { value: "{colors.brand.100}" },
          emphasized: { value: "{colors.brand.600}" },
          focusRing: { value: "{colors.brand.500}" },
        },

        // Application-level aliases so pages never name a raw grey.
        surface: {
          DEFAULT: { value: "white" },
          muted: { value: "{colors.gray.50}" },
        },
        line: {
          DEFAULT: { value: "{colors.gray.200}" },
          strong: { value: "{colors.gray.300}" },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
