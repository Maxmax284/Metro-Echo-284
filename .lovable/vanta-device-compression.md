# Device compression — one signal, five bodies

Compression removes detail. It never changes meaning. If the wrist says something
the desk does not, that is a bug, not a style choice.

## The five forms

Worked example. Facts: three GroundStay booking changes; one guest arrival moved
Friday → Saturday; no payment issue.

**Desk (rich)**
```
GroundStay has 3 booking changes.
One guest arrival moved from Friday to Saturday.
No payment issue.
Review them in Work.
```

**Phone (brief)**
```
3 GroundStay changes. One arrival moved.
Review them in Work.
```

**Wrist (signal)**
```
GroundStay: 1 arrival moved.
```

**Spoken (ear)**
```
One GroundStay arrival moved. Nothing urgent. Want the rest?
```

**Haptic only (cue)**
Two short pulses. No words. The user opens the wrist when they want the line.

## Rules

1. The headline is the shared spine. Every form contains it or a shortened form
   of it. Nothing appears at a smaller size that is absent at a larger one.
2. Detail is dropped from the tail, never rewritten. The wrist keeps the strongest
   single fact.
3. Numbers stay honest under compression. "3 changes" cannot become "some changes".
4. Missing data is a gap in every form. Never a zero, never omitted silently.
5. The next-step line belongs to the caller and is quoted verbatim where it fits.
   The wrist drops it and offers "Open on phone" instead.
6. Haptic-only eligibility is a property of urgency, not of length: informational
   and meaningful items may go haptic-only; anything that needs the user shows a line.

## Where this lives

`awareness/compress.ts` decides how much a channel carries. `src/lib/deviceCompression.ts`
renders all five forms from one `NoticeFacts` object and is the only place wrist
copy is produced. Tests assert the forms agree.
