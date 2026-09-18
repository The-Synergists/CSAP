# CSAP Database

This directory houses the PostgreSQL database schema migrations, database seeding scripts, and data architecture reference for the Central Statutory Authentication Platform (CSAP).

## Directory Structure

```
database/
├── migrations/                     # SQL migration scripts for Supabase / PostgreSQL
│   ├── 20260907140000_csap_schema.sql
│   └── 20260907141000_csap_schema_fixes.sql
├── seeds/                          # Data seeding scripts and fixtures
│   └── seed.ts                     # TypeScript seed script using @supabase/supabase-js
├── schema/                         # Architecture and ERD documentation
│   └── schema_documentation.md
├── package.json
└── README.md
```

## Setup & Execution

### 1. Environment Configuration
Ensure `.env.local` exists in the repository root or in this folder with:
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Running Migrations
If using Supabase CLI:
```bash
supabase db push
# or
supabase migration up
```

### 3. Seeding the Database
To populate the database with tenders, bids, companies, and evaluation records:
```bash
npm run seed
```
