## 2024-05-22 - Media Player Accessibility
**Learning:** Media players heavily rely on icon-only controls (Play, Pause, Shuffle) which are intuitive visually but often lack accessible names for screen readers. Tooltips (`title` or custom) are insufficient for keyboard/screen reader users.
**Action:** Always couple icon-only media controls with `aria-label` or `aria-labelledby`, ensuring dynamic states (Play vs Pause, Mute vs Unmute) are reflected in the label.
