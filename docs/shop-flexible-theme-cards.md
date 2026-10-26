# Compact and flexible discovery cards

The owner supplied Screenshot (309).jpg and requested a smaller circled discovery area, optional four-way division of the large left card, optional three-way division of the lower horizontal card, and horizontally scrollable right-hand imagery.

The feature deck is reduced from its previous tall intrinsic layout to 430 px on desktop, with proportionate mobile sizes. Small 1/4 and 1/3 view controls change the left and lower areas without touching products or account state. The choice is remembered only in the current browser tab; unavailable storage does not block the controls. This is a visitor display preference, not a global publication or new advertising administration system.

The right-hand carousel now has six category cards with visible previous/next arrows, scroll-snap and touch scrolling. Keyboard users can focus the region and use left/right/Home/End; native links remain keyboard accessible. End arrows are disabled appropriately. Category definitions are separated in portal-cards.js so more cards can be appended without changing layout code. Existing images remain illustrative; no stock, discounts or sale availability are invented.

Default remains a single left card and single lower card; optional four/three views expose real existing category links. All category, account, shopping cart and comparison actions remain unchanged. No account data, prices or provider configuration is read or written by the presentation module.

Checks cover registry links, bounded storage, optional layouts, arrow/keyboard ends and actual application in native Chromium, including persisted tab preferences and desktop/phone overflow. CI screenshots are public homepage previews before sign-in.
