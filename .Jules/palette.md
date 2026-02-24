# Palette's Journal

## 2025-02-18 - Skip to Content Implementation
**Learning:** Inserting a "Skip to Content" link as the first focusable element in a DaisyUI Drawer layout works seamlessly if placed before the drawer toggle input. This ensures it's the first focus target without breaking the `:checked ~ .drawer-content` CSS sibling combinators, provided the input remains a sibling of the content wrapper.
**Action:** Use this pattern for all drawer-based layouts to ensure keyboard accessibility.

## 2025-02-18 - Focus-Within for Hidden Actions
**Learning:** Using `focus-within:opacity-100` on a parent container is critical for accessible "hover-only" UI patterns (like action menus). It allows keyboard users to reveal hidden controls by tabbing into them, maintaining the clean visual design while ensuring functionality.
**Action:** Always pair `group-hover:opacity-100` with `focus-within:opacity-100` (or `has-[:focus]:opacity-100`) for hidden interactive elements.
