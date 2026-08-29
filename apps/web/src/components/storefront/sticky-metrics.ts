// SPRINT-14: the sticky-layout metrics, derived ONCE (design.md §7.3, §7.4).
//
// The sticky tab bar's `top` and the scroll-to-section offset are the same measurement. Deriving
// them independently is how §7.3's "the active tab is right but the section header is hidden
// under the tab bar" happens, so they are computed here from the component heights and imported
// by both the tab bar and the scroll handler.
//
// Header (§7.4): 64 on mobile / 72 from md. On mobile the store status pill sits BELOW the
// header row rather than inside it, adding its own height plus the row's bottom padding.
const HEADER_ROW_MOBILE = 64;
const HEADER_ROW_DESKTOP = 72;
const STATUS_PILL_HEIGHT = 44;
const STATUS_PILL_ROW_PADDING = 8;
const TAB_BAR_HEIGHT = 48;

/** Where the sticky tab bar pins — directly beneath the header. */
export const TABS_TOP_MOBILE = HEADER_ROW_MOBILE + STATUS_PILL_HEIGHT + STATUS_PILL_ROW_PADDING;
export const TABS_TOP_DESKTOP = HEADER_ROW_DESKTOP;

/** How far above a section to stop, so its header clears the header AND the tab bar. */
export const SCROLL_OFFSET_MOBILE = TABS_TOP_MOBILE + TAB_BAR_HEIGHT;
export const SCROLL_OFFSET_DESKTOP = TABS_TOP_DESKTOP + TAB_BAR_HEIGHT;

/** The md breakpoint (design.md §5.8), used to pick between the two sets at runtime. */
export const MD_BREAKPOINT = 768;
