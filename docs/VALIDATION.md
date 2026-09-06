# Validation record — Axiom Worksheet 0.1.0

## Executed

**113 Node tests passed, 0 failures.** The raw TAP output is in `node-tests.tap`.

The tests cover parser precedence and rejection paths, real arithmetic, units and conversions, homogeneous matrices, LU solves, calculus, symbolic differentiation, dependencies, invalid-definition propagation, cache reuse, plot sampling, document validation/history, scene tessellation/clipping, worker message cloning/state/recovery, and syntax/identity of the standalone build.

The worker tests execute `src/worker.js` on genuine Node background threads with a minimal `self.postMessage` bridge. They verify that function definitions, numeric results and plot samples are cloneable and that the same kernel cache persists across jobs. They do **not** test browser Blob-module worker initialization.

**38 Chromium interaction checks passed, 0 uncaught JavaScript exceptions.** The detailed machine-readable report is in `browser-validation.json`; the test is `tests/browser_e2e.py`. The recorded Chromium version is in that report.

The browser tests exercise the real app DOM, source editing, dependent recalculation, undo/redo, cancelling edits, unit conversion/error recovery, pointer dragging/resizing, matrix insertion, commands, duplicate/delete, native-document serialization and reopening, numeric CSV import, inert imported text, LU/integral/symbolic examples, slider-driven plot changes, actual SVG/HTML/CSV export contents, manual calculation staleness, F9, grid/zoom, responsive layout and print-style visibility.

## Environment restrictions

The browser is managed and blocks normal navigation and several browser facilities. The application was loaded through Playwright `set_content` into an offline document. No browser security policy was changed or bypassed.

Consequently, the run used the **Canvas 2D renderer and main-thread calculation fallback**. It did not execute WebGPU WGSL on a browser GPU, nor launch the browser Blob module worker. Kernel worker behavior was independently checked using Node threads as described above.

Native download interaction was blocked. The test captures generated Blob payloads at the anchor boundary and checks their actual contents instead. Open and CSV import are exercised through the real file-input handlers. Local-storage failure behavior was exercised, not successful cross-session persistence. Print CSS was checked, not a printer or generated PDF file.

## Unverified / not claimed

Browser WebGPU initialization, WGSL pipeline/device execution, adapter compatibility, hardware acceleration and sustained performance are **unverified here**. The checked-in mesh tests cover the CPU geometry builder, not a GPU simulator. Browser worker startup, native downloads, successful persistent storage, actual print pagination/PDF output, broad browser/device compatibility, accessibility conformance, numerical certification and full Mathcad compatibility are not claimed as validated.

No FPS or GPU-time benchmark is reported. The in-app frame diagnostic measures CPU submission, not actual GPU duration.

## Reproduce

```sh
npm run validate
python3 -m http.server 8080 --bind 127.0.0.1
# In another terminal, with Python Playwright installed:
python3 tests/browser_e2e.py
```

Run the normal HTTP mode on a permitted browser/device to validate features unavailable in the offline harness. Inspect `window.axiom.getDiagnostics()` and the View → Rendering engine dialog rather than assuming a backend. The inline restricted-mode invocation used for this record was:

```sh
AXIOM_TEST_INLINE=1 python3 tests/browser_e2e.py
```

## Manual release checks on a target device

Confirm that the status bar actually says WebGPU and the console has no GPU validation errors. Change the beam span and wave frequency, then compare the GPU and `?renderer=canvas` paths while zooming and scrolling. Test worker startup and responsiveness with a large calculation. Save/reload across browser sessions, export/reopen a native file containing a raster image, and inspect a printed PDF with multiple pages and vector curves. Confirm failure handling with an unavailable adapter and blocked storage. These are pending target-device checks, not work already performed.
