# Design QA — Member plan button

- Source visual truth: user-provided 242 × 90 plan-button reference screenshot.
- Source pixels: 242 × 90 px.
- Implementation: `https://family-expense-tracker-gamma-five.vercel.app/membre`
- Implementation evidence: Codex in-app browser capture of the deployed member home page (runtime capture; no persistent filesystem path exposed).
- Viewports checked: default mobile viewport and 360 × 800 CSS px; device scale handled by the browser.
- State: authenticated member, light theme, FREE plan.

## Full-view comparison evidence

The deployed header reproduces the reference pill: rounded outlined surface, amber crown, “Forfait” label, and green uppercase FREE badge. At 360 px, the descriptive label collapses while the crown and FREE badge remain visible so the existing header controls do not overflow.

## Focused region comparison evidence

The header plan-control region was inspected at the default viewport and at 360 × 800. Border radius, spacing, icon color, badge color, typography hierarchy, and alignment match the supplied reference closely. The control visibly navigates to `/abonnement`.

## Required fidelity surfaces

- Fonts and typography: existing product font and weights preserve the reference hierarchy; passed.
- Spacing and layout rhythm: pill sizing and internal spacing match; responsive collapse prevents overflow; passed.
- Colors and visual tokens: amber crown, green badge, subtle border/background, and contrast match; passed.
- Image quality and asset fidelity: no raster assets are required; the crown comes from the established icon library; passed.
- Copy and content: “Forfait” and the live plan label are correct; passed.

## Findings

No actionable P0, P1, or P2 issues.

## Interaction and technical checks

- Button visibility confirmed on the deployed member landing page.
- Navigation to `/abonnement` confirmed.
- Mobile layout confirmed at 360 × 800.
- Browser console warnings/errors: none.
- `npm run lint`: passed.
- `npm run build`: passed.

## Comparison history

- Initial implementation passed; no P0/P1/P2 fixes were required.
- Responsive label collapse at widths below 480 px is an intentional product adaptation, not design drift.

final result: passed
