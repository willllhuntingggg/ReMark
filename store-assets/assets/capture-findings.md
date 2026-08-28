# Capture findings

## Text highlight

The article capture renders the real `content/content.js` highlight: an amber rounded passage (brand accent `#F5A623` via the current mark-color preset), with the persistent note control when a note exists. The page stylesheet `content/content.css` must be loaded by the harness — without it the browser renders the default yellow `<mark>`, which is not the product look.

The highlighted passage is scrolled to the viewport center before capture, so the wide shot and the tight passage crop both frame the mark naturally.

## Side Panel

`sidepanel-demo.html` runs the real `sidepanel.html` + `sidepanel.css` + `sidepanel.js` with two seeded marks: a Text Mark with an attached Note (newest), and a video Mark at `1:07` with its caption. The panel is captured at its real 440 px width, cropped to its content height so layouts can compose it tightly.

## YouTube video context

Headless Chrome on macOS does not composite HTML5 video frames into screenshots (the canvas renders blank/white). The reliable authentic state is the player's cued thumbnail: intercepting `googlevideo.com` media streams keeps YouTube on its real poster frame with the play button — a genuine interface state from the product environment, rendered as a network image.

Big Buck Bunny 60fps 4K (Blender Foundation) is used as the video example; its open license makes it appropriate for store imagery.
