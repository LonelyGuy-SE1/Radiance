# Radiance

This is a hand tracking thing that puts glowing particles around your hand using your webcam. It looks like one of those sci fi hologram interfaces. (Somewhat)

## What's on screen ?

- A rainbow ring around your palm that gets bigger/smaller as you spread your fingers
- Little bars that bounce when you move your hand around
- Tiny cubes floating around the ring
- Glowing dot trails that swirl outward
- Sparks fly when you pinch or open your fist fast

There's a control panel in the top right where you can change the particle count, size, sensitivity, and toggle a skeleton view on/off. (I suggest you tweak around the sensitivity and size a bit in order to get the best experience, I personally prefer it at a sensitivity of 1 :))

## How to run it

You'll need [Node.js](https://nodejs.org/) installed.

```
cd web-demo
npm install
npm run dev
```

It should open in your browser at `http://localhost:5173`. Let it use your camera and hold your hand up.

You could also try this at `http://vinbeatscats.vercel.app/`.
