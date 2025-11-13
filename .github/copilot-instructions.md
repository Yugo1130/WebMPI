## Quick context

WebMPI is a lightweight in-browser MPI prototype. It runs three logical components:
- nginx (serves static frontend) — `docker-compose.yaml` mounts `runtime/client` into nginx
- node server (controller/participant router) — code in `runtime/server/server.js` (listens on ports 9000/9001)
- browser clients (controller / participant pages + WebWorker executing Emscripten-built WASM) — under `runtime/client`

Key idea: MPI semantics are implemented in WebAssembly/C (`webmpi-library/mpi.c` -> `sample.js`/`sample.wasm`) and bridged to the runtime via postMessage between Worker and main thread; the node server only routes controller/participant discovery and spawn info (not actual MPI messages between ranks).

## What an AI agent should know first (50–100 words)

- Controller UI (`runtime/client/controller.html` + `src/router/controller.js`) connects to the server WebSocket on port 9000 to request a spawn (`type: "request_spawn"`).
- Participants (`runtime/client/participant.html` + `src/router/participant.js`) connect to port 9001 and receive `connection_info` and `spawn_info` messages.
- When spawn is received, `handleSpawnInfo` in `runtime/client/src/router/client.js` creates WebWorkers (`/src/worker/worker.js`) and maps ranks -> workers.
- Emscripten-built code (e.g. `runtime/client/wasm/sample.js`) uses EM_JS/postMessage to send `mpi-send` and `mpi-recv-request` messages to its worker which are then routed by `runtime/client/src/router/router.js`.

## Files and examples to reference when editing runtime logic

- Server WebSocket routing: `runtime/server/server.js` — handles `request_spawn`, builds `spawn_info` and sends it to participants.
- Client spawn handling & worker lifecycle: `runtime/client/src/router/client.js` — constructs `rankToClientId`, `clientIdToRanks`, `rankToWorker` and posts `init` to workers.
- Worker glue: `runtime/client/src/worker/worker.js` — imports `wasm/sample.js` and sets Module hooks (print/printErr).
- WASM/C integration: `webmpi-library/mpi.c` — shows how MPI calls postMessage (e.g. `mpi_isend` -> `mpi-send`). See generated wrappers in `runtime/client/wasm/sample.js`.
- Message routing logic: `runtime/client/src/router/router.js` — maintains `messageQueue` and `requestQueue` and implements local (same-client) send/receive matching.

## Developer workflows & commands (what actually runs)

- Local quick run (uses docker-compose defined in repository root):

  - Start services: docker-compose up --build
  - nginx serves `runtime/client` on host port 8080
  - node server runs in `app` container and listens on ports 9000 (controller) and 9001 (participant)

- To run the node server locally without Docker (useful for rapid iteration):

  - cd runtime/server
  - npm install
  - npm start

Notes: the Dockerfile copies `runtime/server/package*.json` then `runtime/server/` — ensure edits to server code are copied into the image when rebuilding.

## Project-specific conventions and gotchas (explicit, not generic)

- Host/port discovery: frontend uses `location.hostname` and hardcoded ports (9000/9001). When testing locally without docker, open the HTML via a webserver or point nginx to `runtime/client`.
- Slots semantics: `controller` UI populates `nodes` with a `slots` number; server enforces total slots vs worldSize. See `server.js` `request_spawn` handling.
- MPI matching behavior lives on the client: `router.js` implements same-client message matching by comparing `dest`, `source` (or null for MPI_ANY_SOURCE), `tag` (or null for MPI_ANY_TAG) and `commId`.
- Worker WASM loading: worker's `locateFile` assumes `sample.js`/`sample.wasm` are available under `/wasm/` (nginx serves `runtime/client` root). Worker adds a cache-busting query param when loading the wasm.
- Data marshalling: currently the code slices HEAPU8 and posts ArrayBuffers via postMessage (see `webmpi-library/mpi.c`). This is a performance area (comment suggests switching to transfer/SharedArrayBuffer).

## Typical small edits and examples

- Adding a new message type from WASM -> host: follow `mpi-send` or `mpi-recv-request` in `webmpi-library/mpi.c` and `runtime/client/wasm/sample.js` then handle it in `worker.onmessage` (see `client.js`) and `router.js`.
- To change spawn allocation: edit `runtime/server/server.js` in the `request_spawn` branch — allocation fills `rankInfos` then sends `spawn_info` to each client.

## Testing & debugging tips

- Use browser DevTools Console and Network (WebSocket frames) — controller/participant pages log connection and spawn events to `output_info`.
- Server logs: run `runtime/server/server.js` directly (npm start) and watch console for warnings like `insufficient-slots-error` and `client not found` messages.
- Worker / WASM logs: the worker posts stdout/stderr back to the page (message types "standard-output" / "standard-error-output"). Inspect the DOM element with id `output` (the page shows these logs).

## When you make PRs

- Preserve existing message types used by the frontend and server: `request_spawn`, `spawn_info`, `client_list`, `connection_info`, `mpi-send`, `mpi-recv-request`.
- Keep WebSocket ports and nginx mount behavior in mind. If changing ports, update `controller.js` and `participant.js` which use `WS_PORT = 9000/9001`.

---
If anything here is unclear or you want additional details (e.g., run scripts, test pages, or a short diagram), tell me which area to expand and I'll iterate.
