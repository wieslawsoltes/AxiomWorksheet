# Architecture and implementation contracts

## Document is the source of truth

The persistent model contains source expressions and region layout, not executable JavaScript or trusted cached answers. `.axw` is UTF-8 JSON with the `axiom-worksheet` format tag and schema version 1. Import validates the format, type whitelist, safe IDs, bounds, sizes, strings, plot traces and embedded raster-image URLs. Calculated results are regenerated, not loaded as authoritative values.

A `DocumentStore` transaction snapshots the previous document. Pointer manipulation and editing coalesce their changes into one commit; cancellation restores the snapshot. Commit invalidates the redo branch. Undo/redo restores both source and region placement. There is an 80-snapshot limit; this is not a persistent command log or a byte-bounded history store.

The sheet uses logical coordinates: width 900, height 1272, page gap 28, default snap grid 10. Page proportions approximate A4. Page-space positions determine reading order; the camera transform does not affect semantics.

## Numerical representation and execution

`Quantity` carries a binary64 scalar or rectangular numeric matrix plus seven exponents in SI base-dimension order: length, mass, time, electric current, thermodynamic temperature, amount of substance, luminous intensity. Booleans are separately tagged. Operations check dimension compatibility, scalar/matrix shape and finite results. LU decomposition uses scaled partial pivot selection; each matrix has homogeneous entry dimensions.

The Pratt parser produces data-only AST nodes. It recognizes implicit multiplication, postfix factorial/transpose/indexing, right-associative powers and low-precedence definition/conversion syntax. It has no object member access, browser access, `eval`, `Function` constructor or user-supplied JavaScript execution.

Evaluation follows the AST using an explicit environment. A function stores its parameter list, body AST and captured environment. Function-call local variables shadow captured bindings; calculation environments are independent of the UI globals. A lazy `if` evaluates only the selected branch.

Calculus routines share the evaluator's resource budget. Simpson integration recursively subdivides intervals and compares error estimates; maximum recursion depth is 20. Bisection checks bracket signs and residual behavior and permits up to 160 iterations. Numerical differentiation uses a centered five-point stencil; an optional step must have the variable's dimension. Symbolic differentiation/simplification are a bounded rule engine, not a general CAS, and do not prove domain equivalence.

### Defensive limits

| Resource | Limit in this build |
|---|---:|
| Expression source | 20,000 characters |
| Parser nesting | 128 |
| Numeric AST visits per evaluation context | 300,000 |
| Symbolic visits | 50,000 |
| Matrix/range cells | 16,384 |
| LU matrix order | 128 |
| Plot intervals per trace | 64–2,048; interval count + 1 sampled points |
| Traces per plot | 8 |
| Imported document regions/pages | 3,000 / 100 |
| Native file import | 12 MB |
| Numeric CSV input | 2 MB |
| Worker wall-clock timeout | 5 seconds |

These limits operate at different layers. They do not constitute a single aggregate memory/CPU budget for the whole application. Direct kernel consumers should validate documents and enforce their own task budgets.

## Incremental dependency semantics

Each pass sorts regions by page, y, then x and reconstructs the environment in order. Expression dependencies are extracted from parsed ASTs, with formal parameters excluded from function free variables. Each successful definition receives a monotonic revision. Cached regions carry their source/configuration and the revisions of referenced bindings.

An unchanged expression with unchanged dependencies restores its value into the new environment without reevaluation. Formatting precision and output-unit dependencies participate in the signature. A function's free variables participate, so upstream edits invalidate its captured environment and downstream calls. Cache invalidation propagates through revision changes without recursively embedding dependency signatures.

Plots have a separate cache including bounds, axis units, trace expressions, resolution and free-variable revisions. Uniform sample points are created in binary64 and converted to the selected display-unit scales. The UI maps them into device geometry later; changing zoom does not resample the function.

A failed definition poisons that binding for subsequent regions, including syntactically invalid redefinitions and failed slider definitions. This prevents an earlier definition from silently supplying a stale value after a visible failed redefinition. Region errors carry message, code and source position where available. The UI distinguishes calculation errors from stale manual-mode results.

This is an incremental **evaluation** system, not an incremental topological document index: a pass still scans and sorts the entire document.

## Worker protocol and scheduling

Input:

```js
{ type: 'calculate', id: generation, document: validatedDocument }
```

Success:

```js
{ id, results, variables, errors, cacheHits, plotCacheHits, duration }
```

Failure:

```js
{ id, fatal: message }
```

`src/worker.js` owns a persistent kernel. The UI keeps one job in flight and coalesces subsequent requests into the latest pending generation. Only replies matching the current generation may update the visible result state. Editing also invalidates generation IDs in manual mode, so an older automatic calculation cannot incorrectly mark newer source as calculated.

The main-thread host terminates an over-budget worker after five seconds and creates a replacement. A failed browser worker falls back to a local kernel, which preserves functionality but loses hard preemption. Results cross the message boundary as cloneable data; no quantity prototypes or executable closures are sent to the view.

The standalone build embeds the worker source in a JavaScript Blob. Deployments with a restrictive Content Security Policy must explicitly accommodate the inline module/style and Blob worker, or split assets and adapt the policy. Do not broadly disable CSP to host the application.

## Rendering boundary

1. Document/DOM layout determines each visible page and plot rectangle.
2. The invalidated viewport is rebuilt into `SceneBatch` logical rectangles and segments.
3. Plot segments are Liang–Barsky clipped before tessellation.
4. Mesh vertices contain `(x, y, r, g, b, a)` at a 24-byte stride.
5. The vertex shader transforms logical viewport coordinates to clip space. The fragment shader premultiplies the interpolated color by alpha.
6. One triangle-list draw populates a 4-sample render attachment and resolves into the current swap-chain texture.

Line meshes have an opaque core and transparent edge fringe; the fallback uses native Canvas 2D strokes. Minor rasterization differences are expected. The vertex buffer grows geometrically, while its allocation is reused for later frames. GPU and Canvas 2D share the logical scene, not identical pixel output. Device loss replaces the canvas before requesting a different context type.

MathML, text, SVG axis labels, selection adorners and input controls remain browser-rendered. SVG plot paths are also prepared for export/print but are hidden for screen rendering, where the GPU/fallback draws the traces. There is no GPU text atlas, GPU equation layout, compute-based numeric kernel, or all-HTML-on-WebGPU engine.

Page and plot geometry is viewport-culled. DOM regions are not fully virtualized. Scroll, resize, edits and zoom invalidate frames; no continuous RAF animation runs while idle. `cpuSubmitMs` is host-side submission duration only. GPU timestamps, frame pacing, memory pressure and actual device throughput are not measured in this version.

## Persistence, export and trust boundary

Autosave is local to the current browser origin. Storage failure leaves an explicit save-to-file status; repeated identical notices are bounded/deduplicated. Files are the portable source of truth. The app does not send worksheet data to any service.

Imported text is escaped; image input allows embedded raster types only; arbitrary HTML/SVG is not a supported region source. CSV exports guard spreadsheet formula-prefix injection. Numeric CSV import accepts a rectangular table with an optional header, not executable spreadsheet expressions. SVG and HTML exports are generated from validated application data. Read-only reports are not a replacement for the editable native document.

Print preparation requires current results and uses vector plot paths in the print representation. Actual browser/OS print output remains an integration validation task. Numerical success or dimensional consistency is not engineering certification or a guarantee that a user's physical model is appropriate.

## Extension direction

The next architectural seam for Mathcad-like interaction is a structured equation-editor tree and caret/navigation model independent of textual parsing; retaining the AST merely as a parser output is insufficient for that interaction model. Larger documents would benefit from a byte-budgeted command journal, page-level DOM virtualization, an indexed reading-order/dependency graph, transferable plot buffers and localized result patches. General CAS/complex arithmetic/ODE support should enter through explicit value/solver contracts rather than unsafe JavaScript evaluation.
