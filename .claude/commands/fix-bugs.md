Fix all known bugs from the latest QA audit. For each fix:

1. Read the file and understand the surrounding code
2. Apply the minimal change needed
3. Verify the fix doesn't break other functionality
4. Add the fix to a running changelog

After all fixes, run the deploy-check to verify everything builds correctly.

Known bug patterns to look for:
- `Empty` component called with string icons or wrong props
- `Btn` with `color="danger"` instead of `danger` prop
- `fontSize.base` or `colors.backgroundAlt` (undefined theme tokens)
- Hardcoded RTL/Hebrew in components used by all clients
- Missing dedup checks in INSERT operations
- Dead onClick handlers (empty `{}` or `console.log` only)
