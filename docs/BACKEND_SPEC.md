# BACKEND & DATABASE SPECIFICATION (`docs/BACKEND_SPEC.md`)

## 1. System Architecture Pipeline
```text
React Frontend (UI Components)
       ↓
Repository Layer (`src/repositories/supabase/`)
       ↓
Supabase JS SDK / REST API (PostgREST)
       ↓
Supabase Auth & Row Level Security (RLS)
       ↓
PostgreSQL Engine & RPC Functions (`PL/pgSQL`)