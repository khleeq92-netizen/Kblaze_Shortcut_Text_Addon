// Who is recorded as the author of local audit entries and version snapshots.
import { setAuditActor as setA } from '../shared/history';
import { setVersionActor } from '../shared/db';
export const setAuditActor = setA;
export function setVersionActorSafe(a: string) { setVersionActor(a); }
