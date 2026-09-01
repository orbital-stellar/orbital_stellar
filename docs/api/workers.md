## Worker & Operator APIs

### Get Verdicts
`GET /api/workers/verdicts`

Public read endpoint to audit worker verdicts without running an indexer.

**Query Parameters:**
* `worker` (required): The ID of the worker.
* `start_ledger` (optional): Filter verdicts starting from this ledger sequence.
* `end_ledger` (optional): Filter verdicts up to this ledger sequence.

**Responses:**
Includes strict caching headers (`s-maxage=60`) and returns schema, engine, and formula version metadata alongside the `data` array.

### Get Operator Scores
`GET /api/workers/operators`

Retrieves the aggregated reputation scores for a specific operator.

**Query Parameters:**
* `operator_id` (required): The ID of the operator.
