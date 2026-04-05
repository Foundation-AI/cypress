# Filevine E2E Test Setup — Customer 4094 (filevinetest) on Dev

## Customer Master

| Field | Value |
|-------|-------|
| customer_id | 4094 |
| CustomerName | filevinetest |
| extraction_type | Filevine |
| Filevine org_id | 142 |
| Filevine user_id | 1609 |
| Filevine domain | `https://foundationai.filevineapp.com` |
| API URL | `https://api.filevineapp.com/fv-app/v2` |

## DB Changes Made

### 1. Pipeline Config (`xtract.pipleline_customer_config`)

Deleted placeholder row (`queue_name = 'your_queue_name'`) and inserted 4-step pipeline for `default` and `Fax` queues:

| Seq | pipeline_id | pipeline_name |
|:---:|:-----------:|---|
| 1 | 2 | get_doc_name |
| 2 | 3 | generate_pdf_file |
| 3 | 4 | push_to_s3 |
| 4 | 204 | push_validated_to_filevine |

### 2. Task Queues (`xtract.task_queues`)

Added `Fax` queue by copying `queue_information` from the existing `default` queue. User `cypress-filevine` (user_id 7493) was assigned the `default` queue via Retool configUI.

### 3. Master Category (`xtract.master_category`)

- Updated 25 rows: set `queue_name = 'default'` (was empty string)
- Copied 25 rows for `queue_name = 'Fax'`
- Set `configurations` JSON on all 50 rows (was NULL):
```json
{"order": {"Case Name": 1, "Matter ID": 2, "Document Date": 3, "Document Type": 4, "Doctor": 5, "Sender": 6, "Event Date": 7, "Record Location": 8, "Deponent": 9, "Notes": 10, "Tags": 11, "Probable_matches": 12, "Document Category": 13, "Case Type": 14}, "naming_convention": [], "seperator": "_", "parsing_threshold": 0, "color": "#f37d08"}
```

### 4. Customer Config (`xtract.customer_master.customer_config`)

Added two fields:
- `"filevine_fai_certified": true` in `auth_config`
- `"default_docs_folder": "main"` (creates a "main" folder on Filevine projects that have no folders)

### 5. Mapping Info (`filevinetest.mapping_info`)

For test matter `14384`:

| Field | Value |
|-------|-------|
| matter_id | 14384 |
| case_file_id | 14384 |
| case_name | sudha_31_oct |
| root_doc_id | 1000774 |
| status | Archived |

`case_file_id` and `root_doc_id` were empty — `case_file_id` was set to `matter_id`, `root_doc_id` fetched via Filevine API (`GET /projects/14384` → `rootDocFolderId.native`).

### 6. Document Classification (`xtract.document_classification`)

Test doc (id `1484819`, case_id `269471`) `res_json` was updated to have correct field names:
```json
{
  "Matter ID": {"value": "14384", ...},
  "Tags": {"value": "Correspondence", ...}
}
```

## Vault Credentials

Path: `downstream_integrations/v0/customers::4094::default::filevine::pat`

Already existed with correct PAT, client_id, client_secret, org_id, user_id.

## Test Data

| Field | Value |
|-------|-------|
| case_id | 269471 |
| doc_id | 1484819 |
| matter_id (Filevine project) | 14384 |
| queue_name | default |
| document class | Correspondence |
| extract user | sahil.c+cypress-filevine-dev@foundationai.com |
| extract user_id | 7493 |

## Test Flow

1. Login to `extract-dev-frontend.foundationai.com` via Keycloak (3-step: email → provider selection → password)
2. Reset `di_audit` and `downstream_status` for the test doc
3. POST `retrigger_downstream` with `{customer_id: 4094, retrigger_case_ids: [269471]}`
4. Poll `downstream_status` until `Processed`
5. Verify document in Filevine via API (`GET /projects/14384/documents`)
6. Delete document from Filevine via API (`DELETE /documents/{id}`)

## Retrigger Endpoint

```
POST https://extract-backend-dev.foundationai.com/retrigger_downstream
Authorization: Bearer <JWT from extract frontend cookie>
Body: {"customer_id": 4094, "retrigger_case_ids": [269471]}
```