# Palette's Journal

## 2025-02-18 - Skip to Content Implementation
**Learning:** Inserting a "Skip to Content" link as the first focusable element in a DaisyUI Drawer layout works seamlessly if placed before the drawer toggle input. This ensures it's the first focus target without breaking the `:checked ~ .drawer-content` CSS sibling combinators, provided the input remains a sibling of the content wrapper.
**Action:** Use this pattern for all drawer-based layouts to ensure keyboard accessibility.
