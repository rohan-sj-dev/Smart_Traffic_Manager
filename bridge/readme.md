## Bridge
 * bridge.js — Node.js bridge connecting React frontend to C engine + backend servers.
 *
 * Architecture:
 *   React (WS:4000) <-> Bridge <-> C Engine (stdin/stdout)
 *                                     |
 *                              Backend Servers (HTTP 3001-3003)
 *
 * The bridge:
 *   1. Spawns the C engine as a child process
 *   2. Registers backend servers with the engine on startup
 *   3. Accepts WebSocket connections from the frontend
 *   4. Forwards engine events (status, scaling, metrics) to all WS clients
 *   5. Exposes REST endpoints for on-demand actions (send request, health poll)
 *   6. Periodically polls backend server health and feeds it to the engine
 *   7. Runs a traffic generator that sends real HTTP requests through the engine