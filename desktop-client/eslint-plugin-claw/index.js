/**
 * Custom ESLint rules for claw-trader desktop-client.
 *
 * Two rules:
 *   no-hex-color     — flags any hex color literal ("#xxx", "#xxxxxx",
 *                      "#xxxxxxxx") inside a component/page file. Callers
 *                      should use --surface / --fg / --accent CSS vars
 *                      instead.
 *   no-raw-jsx-string — flags long JSX string literals (text children or
 *                      untranslated attribute values). Short strings,
 *                      symbols, and whitespace are skipped.
 */
'use strict';

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isShortOrSymbolic(str) {
  const trimmed = str.trim();
  if (trimmed.length <= 2) return true;
  // Punctuation-only or numeric-only strings are fine.
  if (/^[\s\d\p{P}\p{S}✓✕·+↑↓—]+$/u.test(trimmed)) return true;
  return false;
}

module.exports = {
  rules: {
    'no-hex-color': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow hardcoded hex colors in components; use CSS variables.' },
        schema: [],
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            if (HEX_RE.test(node.value)) {
              context.report({
                node,
                message:
                  'Hardcoded hex color "{{color}}" — use a CSS variable (var(--accent-green), var(--fg-primary), …) or a Tailwind token class.',
                data: { color: node.value },
              });
            }
          },
          TemplateElement(node) {
            // Conservative: flag backtick-embedded hex colors too.
            const raw = node.value?.cooked ?? '';
            const m = raw.match(/#[0-9a-fA-F]{3,8}\b/);
            if (m && HEX_RE.test(m[0])) {
              context.report({ node, message: `Hardcoded hex color "${m[0]}" — use a CSS variable instead.` });
            }
          },
        };
      },
    },

    'no-raw-jsx-string': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Flag hardcoded user-visible strings in JSX; route through i18next t(). Add "// i18n-ignore" on the line to allow.',
        },
        schema: [],
      },
      create(context) {
        return {
          JSXText(node) {
            if (isShortOrSymbolic(node.value)) return;
            context.report({
              node,
              message:
                'Hardcoded JSX text "{{text}}" — wrap in t("section.key") or add "// i18n-ignore" on the line.',
              data: { text: node.value.trim().slice(0, 40) },
            });
          },
          JSXAttribute(node) {
            const attrName = node.name?.name;
            // Only check user-visible text attributes.
            if (!['placeholder', 'title', 'aria-label', 'alt'].includes(attrName)) return;
            const value = node.value;
            if (!value || value.type !== 'Literal') return;
            if (typeof value.value !== 'string' || isShortOrSymbolic(value.value)) return;
            context.report({
              node,
              message: `JSX attribute "${attrName}" has hardcoded "${value.value.slice(0, 40)}" — route through t().`,
            });
          },
        };
      },
    },
  },
};
