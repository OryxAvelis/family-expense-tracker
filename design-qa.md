# Design QA

## Member plan button

- Source visual truth: user-provided 242 × 90 plan-button reference screenshot.
- Source pixels: 242 × 90 px.
- Implementation: `https://family-expense-tracker-gamma-five.vercel.app/membre`
- Implementation evidence: Codex in-app browser capture of the deployed member home page (runtime capture; no persistent filesystem path exposed).
- Viewports checked: default mobile viewport and 360 × 800 CSS px; device scale handled by the browser.
- State: authenticated member, light theme, FREE plan.

### Comparison

The deployed header reproduces the reference pill: rounded outlined surface, amber crown, “Forfait” label, and green uppercase FREE badge. At 360 px, the descriptive label collapses while the crown and FREE badge remain visible so the existing header controls do not overflow.

The header plan-control region was inspected at the default viewport and at 360 × 800. Border radius, spacing, icon color, badge color, typography hierarchy, and alignment match the supplied reference closely. The control visibly navigates to `/abonnement`.

### Checks

- Fonts, typography, spacing, layout rhythm, colors, visual tokens, and copy: passed.
- No raster assets are required; the crown comes from the established icon library.
- Navigation to `/abonnement`: passed.
- Mobile layout at 360 × 800: passed.
- Browser console errors: none.

Status: passed

## Member purchase flow

- Source visual: `C:\Users\Youssef\AppData\Local\Temp\codex-clipboard-fab7bed9-4833-4702-a647-73bf2ef959cd.png`
- Implementation: `https://family-expense-tracker-gamma-five.vercel.app/admin`
- Implementation screenshot: captured inline through the authenticated Chrome QA session; the browser API did not expose a filesystem path.
- Desktop viewport: 1280 × 768, device pixel ratio 1.
- Mobile viewport: 390 × 844, device pixel ratio 1.
- Tested state: purchase dialog open for Mohamed, product added, quantity and unit price edited, then verification step opened.

## Comparison

### Full screen

- The implemented dialog follows the selected three-step member → products → verification structure.
- Member identity and available balance are visually prominent before product selection.
- The desktop screen uses the same two-column search/cart composition as the source visual.
- The sticky footer keeps the remaining balance and next action visible while the catalog and cart scroll.
- The implementation uses live product images and production data rather than placeholder artwork.

### Focused interaction

- Searching `lait` returns the milk product through multilingual matching.
- Adding Round bread enables verification and updates the remaining balance immediately.
- Increasing the quantity to 2 and editing the unit price to 1.50 DH produces a 3.00 DH total and a 197.00 DH remaining balance from 200.00 DH.
- The verification step repeats the member, line item, total, and post-purchase balance before the write action.
- The member step exposes every current member and their available wallet balance.
- No real purchase was submitted during QA.

## Responsive and accessibility checks

- At 390 × 844, the dialog is 390 px wide and the document scroll width is 375 px, so there is no horizontal overflow.
- Product and cart columns stack on small screens, while the footer remains reachable.
- Steps, add/remove controls, quantity controls, price fields, date fields, and final actions expose accessible names.
- Browser console errors: none.

## Findings and fixes

1. The original compact form did not communicate the member balance or show a real cart. Replaced it with a guided flow and live balance math.
2. Product discovery was a narrow suggestion row. Replaced it with search, frequent product cards, and an expandable catalog.
3. Quantity and real paid price were not easy to verify. Added inline quantity controls, editable unit prices, line totals, and a dedicated verification step.
4. Desktop and phone layouts required different information density. Added responsive stacking and a sticky mobile-safe action footer.

## Primary interactions verified

- Open the member-purchase dialog.
- Change the selected member.
- Search the catalog.
- Add a product.
- Increase and decrease quantity.
- Edit the actual unit price.
- Remove a line or clear the cart.
- Review the purchase before recording it.

Final result: passed
