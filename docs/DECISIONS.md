# ARCHITECTURAL DECISION RECORDS (ADR)

## ADR 001: Offline Mock Repository Architecture
- **Status:** Approved
- **Context:** Local LLM agents need predictable, fast test environments without spinning up external database containers or live backend APIs.
- **Decision:** Implement all data access interfaces under `src/repositories/` backed by stateful in-memory implementations in `src/repositories/mock/`.
- **Consequences:** All features can be completely built, rendered, and validated (`npm run build`, `npm test`) purely in offline front-end space.

## ADR 002: Sequential Worker Execution Rule
- **Status:** Superseded (2026-08-20) — project no longer runs on local Ollama; the VRAM constraint that motivated this ADR no longer exists.
- **Context (historical):** Spawning multiple concurrent worker agents risked exhausting GPU VRAM and stalling local Ollama models.
- **Decision (historical):** The Queen Bee invoked worker bees sequentially in single passes.
- **Superseding decision:** The Queen Bee may dispatch worker bees in parallel when their task scopes don't overlap (e.g. different `src/features/*/` directories) and don't have a dependency ordering (e.g. a feature bee depends on Architect Bee's foundation landing first). Bees whose file scopes could conflict, or where one bee's output is another's input, are still sequenced.