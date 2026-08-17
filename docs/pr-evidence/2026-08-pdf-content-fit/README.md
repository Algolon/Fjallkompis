# Content-fit PDF modal — evidence run

Samsung feedback on 2700012: the lightbox direction is right, but a
one-page ticket floated at the top of a nearly full-height modal over a
large empty stone area. Root cause (measured, not guessed): the dialog had
a FIXED viewport height (`height: calc(100dvh − safe − 24px)`,
`max-height: none`) and the document viewport was `flex: 1` — it stretched
to fill regardless of content.

Now the modal **wraps the document**: `height: fit-content` +
`max-height: calc(100dvh − safe − 32px)`, vertically centred between the
safe areas, with the document viewport pinned to its FIT-WIDTH height by
the shared arithmetic (`fitDocumentHeight`) — so committing a pinch zoom
can never resize the outer frame. Taller documents cap and scroll inside
under the fixed header. One fix this run surfaced and proved: the
header/scroller must be **direct flex children of the dialog** — an
intermediate `height: 100%` wrapper resolves the percentage against a
content-sized parent as *auto*, leaving the scroller unclipped-but-clipped
and the tail of the document unreachable. `results.json` from the second
run (after that fix) is what ships here.

Measured on the real native bundle, 412×915 mobile emulation (no OS
insets — on real phones the safe areas make the cap ≈ 89–93dvh):

| case | measured |
| --- | --- |
| 1-page ticket | dialog **587 px** of 915 (header 45 + page 512 + 28 pad + border), **164 px backdrop above AND below** (centred), 14 px after the page |
| 1-page + pinch ×2 | dialog height/top **unchanged** (587/164); zoomed content scrolls inside the stable frame |
| 2-page | dialog capped at **883 px** (viewport − 32); scroller 836 client / 1062 content → real internal scroll; header visible at end-scroll; 14 px after the last page |
| 5-page | same 883 px cap; page 5 reachable and rendered |
| corrupt PDF | compact 267 px card with the honest error + Save a copy |
| image ticket | unchanged image sheet |
| backdrop tap | closes; Wallet state intact |
| desktop 1024×768 | content-fit modal capped at 688 px, centred both axes, 40 px backdrop top/bottom |
