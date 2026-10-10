# Listening pass

A listening pass on a stereo mix. It reads the file in the browser and writes a short report on loudness, tone, and the stereo image. The file stays on the device.

Drop in a mix. The pass measures the whole file, then groups what it finds into dynamics, frequency, and space. A second file can sit beside the first, with the difference written next to the matching numbers.

Analysis runs locally with the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) and [Essentia.js](https://mtg.github.io/essentia.js/). The interface is a React app, built with Vite and TypeScript.

Open it at [davidnb3.github.io/listening-pass](https://davidnb3.github.io/listening-pass/).
