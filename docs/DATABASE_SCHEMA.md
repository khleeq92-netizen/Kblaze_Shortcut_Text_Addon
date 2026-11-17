# Database schema

## Local: IndexedDB `k-flow-db` (version 2)
Every synced record has `id`, `createdAt`, `updatedAt`, `version`, `deleted?` (tombstone),
`workspaceId?` (`ws_college`, `ws_trading`, `ws_general` or a custom id) and `orgId?` (organization-shared copy).

| Store | Key | Contents |
|---|---|---|
| `workspaces` | id | name, kind, colour, icon, expansionActive, domains, officialDomains, archived |
| `autofill` | id | name, sites[], rules[] (target{by,value,fallbacks,nth,frame}, action, value template, condition, page, overwrite, waitMs, dateFormat, sensitive, includeHidden), datasetId, runMode, shortcut, portal, academicYear, starter |
| `macros` | id | name, sites[], steps[] (type, target, value, ms, condition, onError, retries, maxIterations, refId, note, disabled, sensitive), settings (stepDelayMs, retries, retryDelayMs, timeoutMs, onError, speed), datasetId, shortcut |
| `scripts` | id | name, code, sites, runMode, timeoutMs, maxLoopIterations, datasetId, library |
| `variables` | id | name, kind (static/formula/date/random/dataset/conditional/list/secret/counter), value, format, datasetId, column, branches[], options[], scopeRef |
| `tables` | id | datasets: name, key, columns[] (key, name, type, options), rows[] {id, values}, keyColumn, requiredColumns[], **sensitiveColumns[]** (values stored as `enc:v1:<iv>:<ciphertext>`), currentRowId, source {kind, ref, sheet} |
| `vault` | id | name, key, username, **iv + cipher** (AES-GCM with the vault master key; AAD = id), domains[] |
| `snippets`, `folders`, `templates` | id | text expansion (unchanged model, plus workspaceId) |
| `workflows` | id | legacy Autopilot workflows (migrated to `macros` as `mac_<id>`) |
| `executions` | id (index startedAt) | kind, refId, name, status, url/host, steps[] {i,label,status,ms,error}, filled/failed/skipped, recordLabel, logs. **Never field values.** Pruned to the history limit. |
| `audit` | id (index at) | at, actor, action, resource, resourceId, name, details. Pruned to 5,000 entries. |
| `versions` | id (indexes at, recordId) | collection, recordId, version, at, actor, snapshot. 25 kept per record. |
| `usage` | snippetId | snippet usage statistics |
| `meta` | key | sync cursors, vault config (salt, verifier), AI keys (device-encrypted), seed flags |
| `keys` | key | `device`: non-extractable AES-GCM CryptoKey |

`chrome.storage.local`: `kf.settings`, `kf.cloudConfig`, `kf.syncState`, `kf.org` (cached membership and policy), `kf.deviceId`, `kf.revision`.
`chrome.storage.session` (memory only): `kf.vaultSession` (master key while unlocked), `kf.run.<tabId>` (macro runs), `kf.rec.<tabId>` (recordings).

## Cloud: Firestore
```
users/{uid}/{collection}/{id}       personal mirror of: workspaces, folders, snippets, templates, tables*, autofill,
                                    macros, scripts, variables, vault (ciphertext), workflows
users/{uid}/meta/settings           settings (except plan)
users/{uid}/meta/crypto             { vault: { salt, iterations, verifierIv, verifierCt, updatedAt } }  (no key, no passphrase)
users/{uid}/backups/{id}            { createdAt, label, iv, chunks, size, counts, keyType: 'vault' }
users/{uid}/backups/{id}/chunks/{n} { i, data }   AES-GCM ciphertext (vault master key), <800 KB per document
orgs/{orgId}                        { name, ownerUid, members{uid:role}, memberUids[], memberEmails{}, inviteEmails[], invites{emailKey:role},
                                      permissions{roles,resources,users}, perm{role:[actions]}, deny{uid:[actions]}, allow{uid:[actions]},
                                      policies{allowedDomains, disableScripts, disableAI, requireConfirmOnSubmit, allowSensitiveSync, activityMonitoring},
                                      createdAt, updatedAt }
orgs/{orgId}/{collection}/{id}      shared: workspaces, folders, snippets, templates, autofill, macros, scripts, variables, tables* (+ updatedBy)
orgs/{orgId}/versions/{id}          { collection, recordId, version, at, by, name, snapshot (JSON) }   append-only
orgs/{orgId}/audit/{id}             { at, uid, email, action, resource, resourceId, name, details }      append-only
orgs/{orgId}/activity/{id}          { at, uid, email, device, kind, name, status, host, filled, failed, durationMs } append-only
orgs/{orgId}/devices/{deviceId}     { uid, email, name, ua, firstSeen, lastSeen, revoked, revokedAt }
shares/{id}, marketplace/{id}, admins/{uid}   text-expansion sharing and marketplace
```
\* Datasets with sensitive columns are uploaded **only** when "sync sensitive columns" is enabled (and the organization
policy allows it). Even then, those values are re-encrypted with the vault master key (`encm:v1:`). Otherwise they stay on the device.

Indexes: `marketplace(status, downloads desc)` and `versions(recordId, at desc)`. Single-field indexes cover the
incremental `updatedAt > cursor` sync queries.
