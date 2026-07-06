import { SubmissionSchema } from './submission.schema';

describe('Submission indexes', () => {
  // The exists-then-create in-flight check races across processes; a partial
  // unique index makes the database the arbiter (loser maps E11000 → 409).
  it('enforces one in-flight submission per enrollment+problem', () => {
    const partial = SubmissionSchema.indexes().find(
      ([fields, opts]) =>
        JSON.stringify(fields) === JSON.stringify({ enrollmentId: 1, problemId: 1 }) &&
        opts?.unique === true &&
        opts?.partialFilterExpression !== undefined,
    );
    expect(partial).toBeDefined();
  });
});
