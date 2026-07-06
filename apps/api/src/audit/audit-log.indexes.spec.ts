import { AuditLogSchema } from './audit-log.schema';

describe('AuditLog indexes', () => {
  // The viewer reads newest-first cursors filtered by entity or actorId —
  // compound {filter, _id:-1} indexes serve both the filter and the sort.
  it('defines compound {entity,_id:-1} and {actorId,_id:-1} indexes', () => {
    const indexes = AuditLogSchema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({ entity: 1, _id: -1 });
    expect(indexes).toContainEqual({ actorId: 1, _id: -1 });
  });
});
