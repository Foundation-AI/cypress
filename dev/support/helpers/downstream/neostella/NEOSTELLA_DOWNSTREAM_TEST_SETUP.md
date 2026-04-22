# Neostella Downstream E2E — Setup Guide

End-to-end test for the Neostella PMS downstream push on dev.
Customer: **`5084` — FAI_NeostellaPMS_Sandbox**.

The test drives `retrigger_downstream`, polls `downstream_status`, and verifies:
1. **`di_audit`** — the push_file_to_neostella + email pipelines returned 200.
2. **Neostella API** — the document landed in the Cypress-Test project (then deletes it).
3. **`email_request`** — a notification email was queued + sent to the configured recipient.

---

## 1. Prerequisites

- Neostella OAuth2 client_credentials for customer 5084 — stored in HCP Vault at `customers::5084::default::neostella_direct::<auth_type>`. Keys needed: `client_id`, `client_secret`.
- Cypress Keycloak user for the Neostella customer — see `EXTRACT_NEOSTELLA_PMS_EMAIL` / `EXTRACT_NEOSTELLA_PMS_PASSWORD` in `cypress.env.json` (and `cypress.env.json.example` for the shape).
- Neostella test matter: **Cypress-Test** project (object_type `Pharmaceutical Litigation`). The specific `project_id` is wired into `dev/support/config/testCredentials.ts` under `neostellaTestData.projectId`.

## 2. Customer Baseline

| Field | Value |
|---|---|
| `customer_id` | 5084 |
| `CustomerName` | FAI_NeostellaPMS_Sandbox |
| `extraction_type` | Neostella PMS |
| Neostella tenant_id | managed in HCP Vault — `customers::5084::default::neostella_direct::*` |

## 3. DB Setup

### 3.1 — Add the Neostella push pipelines (`api_master` + `pipeline_master`)

Dev's `pipeline_master` ships only `push_neostella_downstream`. The Fax queue needs two additional pipelines — `push_file_to_neostella` + `send_neostella_doc_pushed_notification_email` — so we seed them explicitly:

```sql
-- api_master rows (returns new api_id for each)
INSERT INTO api_master (api_url, api_method_type, api_param, api_type, api_status)
VALUES
  ('http://downstream/extract/pipeline/push_file_to_neostella', 'POST',
   '["doc_info","user_id","customer_id","case_id","category_filepath","s3_file_location","extraction_type","queue_name","customer_name","customer_config"]'::json,
   'PIPELINE', 1),
  ('http://downstream/extract/pipeline/send_neostella_doc_pushed_notification_email', 'POST',
   '["doc_info","user_id","case_file_id","customer_id","case_id","category_filepath","s3_file_location","extraction_type","queue_name","customer_name","customer_config","file_url","filepath"]'::json,
   'PIPELINE', 1);

-- pipeline_master rows referencing the new api_ids
INSERT INTO pipeline_master (pipeline_name, api_id, status)
VALUES ('push_file_to_neostella', <api_id_1>, 1),
       ('send_neostella_doc_pushed_notification_email', <api_id_2>, 1);
```

Dev got `api_id = 1552, 1553` and `pipeline_id = 2113, 2114`.

### 3.2 — Wire the Fax queue (`pipleline_customer_config`)

Fax queue, api_sequence 4 is a chord of both new pipelines:

| Seq | pipeline_id | pipeline_name |
|:-:|:-:|---|
| 1 | 795 | get_doc_name_updated |
| 2 | 1057 | create_category_ocr_pdf_updated |
| 3 | 4 | push_to_s3 |
| 4 | 2113 | push_file_to_neostella |
| 4 | 2114 | send_neostella_doc_pushed_notification_email |

```sql
INSERT INTO pipleline_customer_config (pipeline_id, customer_id, api_sequence, queue_name, modified_date)
VALUES (2113, 5084, 4, 'Fax', NOW()),
       (2114, 5084, 4, 'Fax', NOW());
```

### 3.3 — Fix missing extraction keys in `task_queues.queue_information`

**Symptom** — docs ingested for the customer land in `ingestion_files` with `ingestion_status = 'Processing Failed'`, `file_size = 0`, and once a `document_classification` row eventually appears it has `res_json = {}`. The UI shows no extracted fields and the downstream chord never runs (no `di_audit` rows). OpenSearch errors in the extract-app / extraction-pipeline logs show:

```
File "/celery/celery_tasks.py", line 1362, in parse
    field_level_threshold = queue_information["field_level_threshold"]
KeyError: 'field_level_threshold'

File "/celery/celery_tasks.py", line 877, in update_parsing_results_db
    category_level_thresholds = queue_information["category_level_threshold"]
KeyError: 'category_level_threshold'
```

**Root cause** — the extraction-pipeline celery tasks read these keys via `queue_information["<key>"]` with no `.get()` fallback, so a missing key crashes the chord and the doc is marked as failed. New customers often ship without these keys on non-default queues.

**Fix** — merge the expected keys into all 6 queues (`default`, `Fax`, `Email`, `Breakdown`, `Scan`, `Portal Docs`). `jsonb ||` is additive, so existing overrides are preserved:

```sql
UPDATE task_queues
SET queue_information = (
  queue_information::jsonb || '{
    "field_threshold": true,
    "field_level_threshold": {},
    "category_level_threshold": {},
    "table_level_threshold": {},
    "document_properties": "http://generic/extract_doc_properties",
    "refresh_extractions": true,
    "doctype_classification_method": "cluster_embedding"
  }'::jsonb
)::json,
modified_date = NOW()
WHERE customer_id = 5084;
```

Verify with:

```sql
SELECT queue_name,
  (queue_information::jsonb ? 'field_level_threshold') AS has_flt,
  (queue_information::jsonb ? 'category_level_threshold') AS has_clt
FROM task_queues
WHERE customer_id = 5084;
```

Both columns should return `t` for every queue. See [extraction-pipeline/celery_tasks.py:1362](../../../../../../extraction-pipeline/celery_tasks.py#L1362) + `:877` for the crash sites.

After this fix, a re-ingested doc should leave `Processing Failed` and reach the downstream chord, producing a non-empty `res_json` and rows in `di_audit`.

### 3.4 — Copy extraction field mappings (`api_mapping`)

Dev is missing `Matter ID` + `Tags` field mappings for the Neostella customer. Without these, `res_json` stays empty `{}` after parsing (no fields extracted). Seed the rows for customer_name `FAI_NeostellaPMS_Sandbox`:

```sql
-- 204 rows total:
--   17 categories × 6 queues × 2 fields (Matter ID + Tags).
-- Each row references model_field_id 397 (WC - Matter ID) / 90 (WC - Tags) — both must exist in
-- ds_model_field_master before inserting.
-- Build the INSERTs by templating from an existing working customer's api_mapping rows for
-- the same field_name values, then replaying against dev.
```

### 3.5 — Add `Medical Records` to Correspondence subcategories (`fai_subcategory_mapping`)

The Tags dropdown in the UI pulls from `fai_subcategory_mapping.external_tags`. `push_file_to_neostella` gates uploads on `email_config.push_files_config`, which for this customer contains `{"Medical Records", "Discovery", "RootFld"}`. Neither tag was in `external_tags`, so the UI couldn't surface `Medical Records` and the pipeline couldn't route uploads into the `Medical Records/2029/April` folder tree.

Append `Medical Records` to every Correspondence subcategory:

```sql
UPDATE fai_subcategory_mapping
SET external_tags = external_tags || ',Medical Records',
    modified_date = NOW()
WHERE customer_name = 'FAI_NeostellaPMS_Sandbox'
  AND fai_category = 'Correspondence'
  AND (external_tags IS NULL OR external_tags NOT LIKE '%Medical Records%');
```

### 3.6 — Customer preferences (`customer_preferences`)

Three new prefs / one existing to keep:

| Preference | Status | Purpose |
|---|---|---|
| `cron_tasks` | **added** | Tells the `Process_Downstream_Tasks` Airflow DAG to run the `index_records` task for this customer. |
| `index_mapping_info` | **added** | Defines the `SELECT * FROM mapping_info` query and the target OS index `5084_fai_neostellapms_sandbox_matter`. |
| `matter_id_mapping` | exists | Read by extract-app's `get_mapping_info` to decide which OS index the Matter Table picker queries. |
| `email_config.Medical Records.static_email_ids` | kept empty | Forces email routing via the Attorney role on the project (exercises `resolve_emails_for_roles`). |

```sql
INSERT INTO customer_preferences (customer_id, preference_name, preference_value, is_active, upload_date, modified_date)
VALUES
  (5084, 'cron_tasks',
   '{"index_records_mapping_info": {"task": "index_records", "params": "index_mapping_info"}}'::json,
   true, NOW(), NOW()),
  (5084, 'index_mapping_info',
   '{
     "db_query": {"global": "SELECT * FROM mapping_info"},
     "elastic_mapping": {
       "global": {
         "index_name": "5084_fai_neostellapms_sandbox_matter",
         "date_fields": ["created_date","modified_date","date_of_injury","case_created_date","case_modified_date","dob"],
         "primary_key": "matter_id"
       }
     }
   }'::json,
   true, NOW(), NOW());
```

### 3.7 — Customer config (`customer_master.customer_config.components`)

- `rowToExtractedFieldsMapping` → `{"matter_id": "Matter ID"}` — auto-populates the Matter ID field when the user picks a matter from the UI picker.
- `mappingInfoForNewAPI.rowToExtractedFieldsMapping` → `{"Matter ID": "Matter ID"}` — same, for the new-API picker flow.
- `cacheFields` — removed `"Matter ID"` and `"Document Type"`. With those present, `FieldValueCell` short-circuits to an `AutocompleteField` reading from localStorage (which is empty), so the Document Type dropdown silently renders as a text input with no options. Setting `["Case Name","Applicant First Name","Applicant Last Name","Sender","Doctor"]` makes Document Type fall through to the `CustomDropDown` path.

```sql
UPDATE customer_master
SET customer_config = (
  customer_config::jsonb ||
  jsonb_build_object(
    'components',
    customer_config::jsonb->'components' ||
      jsonb_build_object('rowToExtractedFieldsMapping', jsonb_build_object('matter_id','Matter ID')) ||
      jsonb_build_object('mappingInfoForNewAPI',
        (customer_config::jsonb->'components'->'mappingInfoForNewAPI') ||
        jsonb_build_object('rowToExtractedFieldsMapping', jsonb_build_object('Matter ID','Matter ID'))
      ) ||
      jsonb_build_object('cacheFields',
        '["Case Name","Applicant First Name","Applicant Last Name","Sender","Doctor"]'::jsonb)
  )
)::json,
modified_date = NOW()
WHERE customer_id = 5084;
```

After this, users must **log out + back in** — frontend caches these fields at login via `/fetch_account_details`.

## 4. Airflow — Build the OpenSearch Index

With `cron_tasks` + `index_mapping_info` in place, trigger the indexing task once to create `5084_fai_neostellapms_sandbox_matter`:

```bash
# exec into the airflow scheduler pod
airflow dags reserialize    # pick up the new 5084 task in Process_Downstream_Tasks

airflow tasks test Process_Downstream_Tasks \
  index_records_mapping_info_FAI_NeostellaPMS_Sandbox_5084 \
  $(date +%F)
```

Creates index + alias. Afterwards, the DAG's scheduled runs keep it in sync automatically. (Neostella → `mapping_info` table is populated by the `neostella_sync` DAG, also scheduled.)


## 5. Neostella Side — Attorney Role Assignment

`email_config.Medical Records.attorney_staff_roles = ["Attorney"]` expects a user with role `Attorney` on the target project. Two calls via the Neostella API (`https://api.neostella.app`, `Authorization: Bearer <token from oauth2 client_credentials>`):

**Look up the IDs you'll need:**
- Attorney `role_id` → `POST /v1/access/roles/list` with `{"page":0,"page_size":100}`, find the role with `role_name = "Attorney"`.
- "Full" user type id → in the same response, under the Attorney role's `user_types`.
- Recipient user id → `POST /v1/access/users/list` with a filter matching the recipient email.
- Project id → see `neostellaTestData.projectId` in `dev/support/config/testCredentials.ts`.

**(a)** The shipped `Attorney` role only covers Personal Injury projects. Cypress-Test is Pharmaceutical Litigation, so PATCH the role to expand `project_types`:

```
PATCH /v1/access/roles/<attorney-role-id>
{
  "role_name": "Attorney",
  "description": "Represents injured clients, negotiates settlements, and handles litigation.",
  "project_types": ["projects/personal-injury", "projects/mass-tort/pharmaceutical-litigation"],
  "user_types": ["<full-user-type-id>"]
}
```

**(b)** Assign the configured email recipient (see `neostellaTestData.emailRecipient`) as Attorney on Cypress-Test:

```
POST /v1/projects/<project-id>/users
{
  "users": [
    {
      "user_id": "<recipient-user-id>",
      "roles": ["<attorney-role-id>"]
    }
  ]
}
```

Verify with `POST /v1/projects/users/list` `{"project_id":"<project-id>","page":0,"page_size":500}`.

## 6. One-Time Test Document

Upload one PDF to the Fax queue as the cypress user. Then manually validate it via the UI:

- **Matter ID** = the Cypress-Test `project_id` (see `neostellaTestData.projectId`)
- **Document Type** = `Referral Ltr`
- **Tags** = `Medical Records`
- Click **Validate**.

Record the resulting `doc_id`, `case_id`, and Neostella `project_id` in [`dev/support/config/testCredentials.ts`](../../../config/testCredentials.ts) under `neostellaTestData`. The test retriggers this same doc on every run; cleanup of the Neostella-side doc is automated in step 6 of the spec.

> **Tag is not optional.** As of the upstream [untagged-doc skip](../../../../../../downstream/downstream/src/routes/neostella/send_neostella_doc_pushed_notification_email.py) change, docs without a tag that has `send_email: true` in `email_config` skip the notification entirely. `Medical Records` satisfies this — if you use a different tag, make sure `email_config[tag].send_email = true` for the customer.

Baseline test shape (values live in `testCredentials.ts`):

| Field | Source |
|---|---|
| `case_id`, `doc_id`, `projectId`, `projectName`, `documentName`, `tag`, `emailRecipient` | `neostellaTestData` in `testCredentials.ts` |
| Queue | Fax |
| Doc type | Referral Ltr |

## 7. Cypress Wiring

**Env (`cypress.env.json`):** see `cypress.env.json.example` for the full template. Neostella-specific keys:

```jsonc
{
  "EXTRACT_NEOSTELLA_PMS_EMAIL": "<cypress Keycloak user for customer 5084>",
  "EXTRACT_NEOSTELLA_PMS_PASSWORD": "<Keycloak password>",
  "NEOSTELLA_API_URL": "https://api.neostella.app",
  "NEOSTELLA_TOKEN_URL": "https://api.neostella.app/v1/oauth2/token",
  "NEOSTELLA_CLIENT_ID": "<from HCP Vault>",
  "NEOSTELLA_CLIENT_SECRET": "<from HCP Vault>"
}
```

**Files:**

| Path | Purpose |
|---|---|
| `dev/e2e/downstream/send_document_workflow/neostella/send-document-to-neostella.cy.ts` | The spec |
| `dev/support/config/testCredentials.ts` | `extractNeostellaCredentials`, `neostellaConfig`, `neostellaTestData` |
| `dev/support/helpers/downstream/neostella/auth.ts` | OAuth2 client_credentials + cached token |
| `dev/support/helpers/downstream/neostella/verifyDocument.ts` | `POST /v1/documents/list` |
| `dev/support/helpers/downstream/neostella/deleteDocument.ts` | `DELETE /v1/documents/{id}` |
| `dev/support/helpers/downstream/verifyDiAuditSuccess.ts` | Checks di_audit has 200 rows for the given pipeline_ids |
| `dev/support/helpers/downstream/verifyNotificationEmail.ts` | Polls `email_request` for the SENT row |

## 8. Run the Test

```bash
cd cypress
npx cypress run --spec "dev/e2e/downstream/send_document_workflow/neostella/send-document-to-neostella.cy.ts"
```

### What the spec does

1. Log in to the extract frontend (Keycloak 3-step) as the cypress user.
2. Reset `di_audit.response_code = 500` + `downstream_status.doc_downstream_status = 'Processing Failed'` for the test doc.
3. `POST /retrigger_downstream` `{customer_id: 5084, retrigger_case_ids: [<case_id>]}`.
4. Poll `downstream_status` until `Processed` (up to 3 min).
5. Assert `di_audit` has a 200 row for pipelines **2113** (push_file_to_neostella) and **2114** (send email); capture pipeline 2114's `response_message` JSON for URL assertions in step 6.
6. Hit Neostella `POST /v1/documents/list` for the test project; assert a doc named `Referral Ltr.pdf` exists. Then assert the email payload's deep-link URLs match the expected shape:
   - `file_url` = `https://neostella.app/core/projects/<projectId>/documents/<new document_id>?documentDetailsTabs.tab=overview`
   - `matter_home_url` = `https://neostella.app/core/projects/<projectId>/documents?documentsTabs.tab=all-documents`

   Finally `DELETE /v1/documents/{id}` to clean up.
7. Poll `email_request` for a row matching the test doc with `status = SENT`, expected recipient (`neostellaTestData.emailRecipient`), and `actual_subject` containing `<documentName> was added to <projectName> - <tag>`, `created_datetime >= retrigger start`.
