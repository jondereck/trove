# Trove Loader Animation Specification

## Goal

Create a premium loading animation that matches the provided storyboard
as closely as possible.

**Overall duration:** **3.2 seconds** - Loop seamlessly until the save
request completes. - If the save finishes early, allow the current
animation cycle to finish before transitioning.

------------------------------------------------------------------------

# Visual Style

-   Background: Warm off-white (#FAF7F3)
-   Soft radial glow behind the chest
-   Minimal shadows
-   Premium Apple / Notion quality motion
-   Smooth cubic-bezier easing
-   60 FPS
-   Rounded corners everywhere
-   No harsh movement

------------------------------------------------------------------------

# Animation Timeline

## Scene 1 (0.0s--0.6s)

State: - Treasure chest closed. - Link card floating above center. -
Tiny sparkle particles.

Text: Stashing your link... Preparing your item

Animation: - Card gently floats (4px up/down). - Glow pulses 5%.

------------------------------------------------------------------------

## Scene 2 (0.6s--1.3s)

Chest: - Lid opens to approximately 105°. - Bounce slightly at the end.

Card: - Tilts -8°. - Accelerates toward chest. - Motion arc instead of
straight line.

Text: Stashing your link... Adding to your Trove

------------------------------------------------------------------------

## Scene 3 (1.3s--1.8s)

Card: - Drops inside chest. - Slight squash (96%) on impact.

Particles: - 4--6 sparkles. - Small dust puff.

Text: Stashing your link... Organizing it for you

------------------------------------------------------------------------

## Scene 4 (1.8s--2.3s)

Chest: - Lid closes smoothly. - Small bounce after closing.

Text: Stashing your link... Almost there...

------------------------------------------------------------------------

## Scene 5 (2.3s--2.9s)

Effects: - White glow expands. - Sparkles rotate slowly. - Chest gently
scales to 103% then back.

Text: Stashing your link... Finalizing

------------------------------------------------------------------------

## Scene 6 (2.9s--3.2s)

Green circular check appears from upper-right.

Text: Added to your Trove! Ready whenever you need it.

Animation: - Check scales from 0 → 1. - Chest performs a tiny
celebratory bounce.

------------------------------------------------------------------------

# Loop Rules

If still saving: - Fade success state. - Return to Scene 1. - Total
loop: 3.2 seconds.

If save completed: - Hold success state for 800ms. - Fade out loader.

------------------------------------------------------------------------

# Motion

-   Easing: easeInOutCubic
-   Chest open: 700ms
-   Card flight: 500ms
-   Chest close: 500ms
-   Glow pulse: 600ms
-   Success bounce: 250ms

------------------------------------------------------------------------

# Assets

-   One rounded treasure chest
-   One rounded link card
-   Sparkle particles
-   Soft radial glow
-   Green success check

Target quality: Premium, polished, and indistinguishable from a high-end
production mobile app loader.
