# Future glasses seam — documentation only

Nothing here is built. This records how glasses would fit if and when they arrive,
so nobody has to invent an architecture under pressure.

## The interaction is deliberate

```
Vanta, look at this.
```

That sentence is the whole model. Vanta looks when asked, and only then.

Possible tasks at that moment:

- read the text in front of the user
- identify a document or object
- explain what it is
- compare it to something already in Vanta
- capture it as a draft
- prepare a next step for review elsewhere

## Hard rules

- No silent background vision.
- No continuous recording by default.
- No execution from glasses.
- No approval from glasses.
- Capture only, with the same provenance trail as every other body: time, device
  source, scope, receipt.
- Anything recognised is a claim with a source, never a fact Vanta asserts alone.

## How it plugs in

Glasses are a device class (`DeviceClass` already has room) with its own compression
level — closer to the wrist than the desk, plus one deliberate visual input. They
reuse the same brain, memory, scope, receipts and action lifecycle. No second store,
no fifth room.

## Adjacent surfaces, same treatment

**Car** — spoken summary, deliberate voice capture, extremely compressed, no approval
while driving.

**Home / room** — an ambient cue, optionally one spoken line. No background chatter,
no autonomous action.

Same Vanta. Different compression.
