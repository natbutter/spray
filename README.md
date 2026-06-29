# Spray Speed-Reader

An open-source speed-reading application written in Javascript.

## About

**Spray** is an open-source web-based speed-reading application. It uses **RSVP (Rapid Serial Visual Presentation)** to display text one word at a time, highlighting the **Optimal Recognition Point (ORP)** (also known as the "pivot") in red. This technique allows you to read much faster by eliminating the need to move your eyes from word to word. Sometimes called "spritz" reading.

It is inspired by [OpenSpritz](https://github.com/Miserlou/OpenSpritz) (via [The Happy Hippo's implementation](https://github.com/the-happy-hippo/spray)).

### [Live Demo](https://natbutter.github.io/spray/)

---

## Features

- **RSVP Engine with ORP Alignment**: Automatically calculates and centers the optimal focal point of each word (right-weighted for longer words) to maximize reading comprehension and speed.
- **Adjustable Speed**: Read at your own pace with configurable speeds from **100 WPM** up to **800 WPM** (defaulting to 500 WPM).
- **Interactive Text-to-Speech (TTS)**: Enable audio to hear the text spoken aloud via the browser's Web Speech API. The visual RSVP reader dynamically synchronizes its speed and active word highlighting with the TTS audio playback.
- **Synchronized Text Highlighting**: As you read, the exact word currently being shown in the speed-reader is highlighted in real-time within the input textarea. The textarea automatically scrolls to keep the active word centered in view.
- **Font Resizing**: Scale the reader text size up or down dynamically using simple control buttons (`+` / `-`).
- **Punctuation Pausing**: Automatically adds natural pauses (delaying the next word) after commas, colons, hyphens, periods, exclamation marks, and question marks to improve readability.

---

## Installation & Running Locally

Since Spray is built using pure HTML, CSS, and vanilla JavaScript, there is no build step or package installation required.

### Quick Start
1. Clone this repository.
2. Open [docs/index.html](file:///usr/local/google/home/butterworthnat/HACK/spray/docs/index.html) directly in any modern web browser.

### Hosting on a Web Server
To host the application:
1. Copy the contents of the `docs/` folder to your web server's public directory.
2. Or, run a local web server from the `docs/` folder:
   ```bash
   cd docs
   python3 -m http.server 8000
   ```
   Then open `http://localhost:8000` in your browser.

---

## Codebase Structure

- [docs/index.html](file:///usr/local/google/home/butterworthnat/HACK/spray/docs/index.html): The main web page, UI layout, and event handlers.
- [docs/js/spray-reader.js](file:///usr/local/google/home/butterworthnat/HACK/spray/docs/js/spray-reader.js): Contains the `SprayReader` class which manages the text preprocessing, timers, speech synthesis integration, text highlighting, and the ORP centering algorithm.
- [docs/css/spray-style.css](file:///usr/local/google/home/butterworthnat/HACK/spray/docs/css/spray-style.css): Styles for the RSVP display, pivot character coloring (red), and the synchronized scroll/highlight overlay.
- [docs/css/site-style.css](file:///usr/local/google/home/butterworthnat/HACK/spray/docs/css/site-style.css): Basic layout and typography styling for the demo page.

---

## Contributing

Contributions, bug reports, and feature requests are welcome! Feel free to fork the repository and submit pull requests.

### Contributors

* [@chaimpeck](https://github.com/chaimpeck)
* [@the-happy-hippo](https://github.com/the-happy-hippo)
* [@maddes](https://github.com/maddes)
* [@natbutter](https://github.com/natbutter)


