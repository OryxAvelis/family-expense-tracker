# Design QA — DarnaFlow family entrance

## Evidence

- Source design: `design-qa-assets/family-entrance-source.png`
- Side-by-side comparison: `design-qa-assets/family-entrance-comparison.png`
- Mobile person selector: `design-qa-assets/family-entrance-faces.png`
- Mobile PIN screen: `design-qa-assets/family-entrance-pin.png`
- Desktop two-panel entrance: `design-qa-assets/family-entrance-desktop.png`
- Implementation: `app/family-entrance.tsx`
- Family route: `app/famille/[familyCode]/page.tsx`
- Owner add-person flow: `app/direct-member-creator.tsx`

## Visual comparison

The implementation preserves the selected reference’s central interaction: a family opens one private page, touches a large person card, and enters a short numeric PIN. It carries over the warm Moroccan palette, DarnaFlow house-and-heart identity, pastel identity cards, large rounded surfaces, green primary actions, bilingual Darija/French guidance, and oversized keypad.

The implementation intentionally adapts the two reference phone panels into a real responsive flow. On phones, the person selector becomes the first screen and selecting a person replaces it with the PIN screen, avoiding horizontal squeezing and unnecessary scrolling. At desktop width, the person selector and PIN panel appear side by side like the reference.

Stored profile photos are used when available. Missing photos fall back to large initials without a broken-image state. The decorative architecture remains background-only and never competes with the controls.

## Usability and accessibility checks

- A normal family member sees no username, invitation form, family identifier, or support reference.
- The private family code remains inside the shareable URL and is validated server-side; the anonymous support reference is not accepted as family access.
- New people and the Buyer use a four-digit PIN; existing longer PINs remain compatible during migration.
- Primary person cards and keypad keys have large touch targets, visible focus treatment, and accessible button labels.
- French, Arabic, and English are selectable from the entrance.
- The voice control reads the current instruction for people who struggle with text.
- Physical number keys, Backspace, and Enter are supported without weakening the touch-first flow.
- Mobile QA at 390 × 844 CSS px: no horizontal overflow (`scrollWidth = 390`).
- Desktop QA at 1280 × 900 CSS px: responsive two-panel layout passed.
- Clean browser session console errors: none.

## Functional checks

- Family directory loads and lists active members.
- Selecting a person opens the PIN screen on mobile.
- Four keypad presses fill the four PIN indicators and enable the entry action.
- “Changer de personne” returns to the person selector.
- Family lookup and member authentication are scoped to the private family access code.
- Profile-image requests verify that the requested member belongs to the resolved family.
- Family Owners can add a member directly with a name and four-digit PIN; there is no invitation step.
- `npm run lint`: passed.
- `npm run build`: passed.

## Findings resolved during QA

1. Missing profile photos could briefly display a broken-image icon. Replaced the foreground image element with a background image over an initials fallback.
2. The first implementation used the anonymous support reference to resolve the family. This could weaken the separation between support and private family access. The entrance now resolves only through the private family code embedded in the family link.
3. Mobile and desktop require different information density. The implementation now switches between a one-screen-at-a-time mobile flow and the source-like side-by-side desktop layout.

final result: passed
