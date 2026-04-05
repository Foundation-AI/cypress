# Extract E2E Tests

Cypress end-to-end tests for the Extract platform's downstream document push pipelines.

## Prerequisites

- macOS Tahoe 26.3.1+ (Apple Silicon)
- Node.js 18+

## Setup

```bash
npm install
cp cypress.env.json.example cypress.env.json
# Fill in credentials in cypress.env.json
```

## Run

```bash
npx cypress open   # Interactive
npx cypress run    # Headless
```

## Structure

```
dev/                          # Dev environment tests
  e2e/
    downstream/
      send_document_workflow/
        filevine/             # Filevine downstream push test
  support/
    config/                   # Test credentials & data
    helpers/
      db.ts                   # Shared DB client
      downstream/             # Downstream status tasks
        filevine/             # Filevine API tasks (auth, verify, delete)
    pages/                    # Page objects
    selectors/                # Element selectors
```

## Environment

Tests run against **dev** (`extract-dev-frontend.foundationai.com`). See [Filevine test setup](dev/support/helpers/downstream/filevine/FILEVINE_DOWNSTREAM_TEST_SETUP.md) for customer 4094 database setup details.
