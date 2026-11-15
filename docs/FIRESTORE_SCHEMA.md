# Firestore schema

All timestamps are epoch milliseconds (client clock). Every synced record has
`updatedAt` and may carry `deleted: true` (tombstone — deletions propagate to other devices).

```
users/{uid}/
  snippets/{snippetId}   Snippet   { name, shortcut, content, contentType: 'text'|'html', folderId, enabled,
                                     favorite, pinned, description, tags[], trigger, source, createdAt, updatedAt, deleted? }
  folders/{folderId}     Folder    { name, parentId, order, color, createdAt, updatedAt, deleted? }
  tables/{tableId}       DataTable { name, key, description, columns[{id,name,key,type,options[]}],
                                     rows[{id, values{}}], createdAt, updatedAt, deleted? }   (≤ ~900 KB per table)
  workflows/{id}         Workflow  { name, description, enabled, siteFilter, steps[{id,type,target{kind,value},value,
                                     snippetId,ms,checked,requireConfirm,clear,note}], createdAt, updatedAt, deleted? }
  templates/{id}         UserTemplate { name, category, description, shortcut, content, contentType, createdAt, updatedAt }
  meta/settings          { settings: Settings (plan fields ignored on pull), updatedAt }

shares/{shareId}         { ownerUid, ownerName, title, visibility: 'link'|'restricted', allowedEmails[],
                           payload: string (JSON ExportBundle), count, createdAt }

marketplace/{id}         { title, description, category, tags[], shortcut, content, contentType,
                           authorUid, authorName, status: 'pending'|'approved'|'rejected',
                           downloads, createdAt, moderationNote?, moderatedAt?, moderatorUid? }
admins/{uid}             presence = marketplace moderator (managed in the console)

teams/{teamId}           { name, ownerUid, members{uid: 'owner'|'admin'|'editor'|'viewer'}, memberUids[],
                           memberEmails{uid: email}, inviteEmails[], inviteRoles{emailKey: role}, createdAt }
                           emailKey = lower-case email with "." replaced by ","
  snippets/{id}, folders/{id}   same shape as personal records (shared team folder)
  audit/{id}             { at, uid, email, action, detail }        append-only
  usage/{uid}            { email, counts{snippetId: n}, updatedAt }
```

## Access rules (summary — see `firebase/firestore.rules`)

| Path | Read | Write |
|---|---|---|
| `users/{uid}/**` | owner only | owner only |
| `shares/{id}` | anyone with the id if `visibility=link`; listed emails if `restricted`; owner | create by owner, delete by owner, no updates |
| `marketplace/{id}` | approved: everyone; pending: author + admins | create as `pending` by author; admins moderate; signed-in users may only `downloads += 1` |
| `teams/{id}` | members and invitees | admins manage members/invites (owner fixed); invitees add only themselves with the invited role; members may leave |
| `teams/{id}/snippets, folders` | members | owner/admin/editor |
| `teams/{id}/audit` | owner/admin | create by members, never updated or deleted |
| `teams/{id}/usage/{uid}` | owner/admin and that member | that member |

## Sync algorithm

1. **Pull** documents with `updatedAt > lastPull` for each collection.
2. For each remote doc: insert if missing; if remote is newer it wins, unless the local copy was
   also edited since the last push → conflict, resolved by the user's strategy
   (`newest` or `keep-both`, which saves a "(conflict copy)"). Conflicts are logged in Settings.
3. **Push** local records with `updatedAt > lastPush` (batched, 400 per batch).
4. Tombstones older than 30 days are purged locally.

Usage statistics stay on the device (team analytics are reported explicitly).
