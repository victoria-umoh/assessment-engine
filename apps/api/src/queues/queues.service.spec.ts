import { QueuesService } from './queues.service';

type FakeQueue = { add: jest.Mock; on: jest.Mock; close: jest.Mock };

describe('QueuesService', () => {
  let grading: FakeQueue;
  let finalization: FakeQueue;
  let service: QueuesService;

  beforeEach(() => {
    grading = { add: jest.fn().mockResolvedValue(undefined), on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    finalization = { add: jest.fn().mockResolvedValue(undefined), on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    service = new QueuesService(grading as never, finalization as never);
  });

  it('registers an error listener on each queue (a Redis blip must not crash the process)', () => {
    expect(grading.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(finalization.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('closes both queues on module destroy', async () => {
    await service.onModuleDestroy();
    expect(grading.close).toHaveBeenCalled();
    expect(finalization.close).toHaveBeenCalled();
  });

  it('enqueueGrading adds a deduped, retrying job keyed by submission id', async () => {
    await service.enqueueGrading('sub-1');
    expect(grading.add).toHaveBeenCalledWith(
      'grade',
      { submissionId: 'sub-1' },
      expect.objectContaining({
        jobId: 'sub-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnFail: false,
      }),
    );
  });

  it('enqueueFinalization never dedupes by jobId — retriggers must always enqueue', async () => {
    // A retained completed/failed job with jobId = enrollmentId would make
    // BullMQ silently drop every later trigger (capstone: day items complete →
    // "pending" no-op job → quiz/coding settle triggers dropped → verdict
    // never written). finalize() is idempotent, so duplicates are harmless.
    await service.enqueueFinalization('enr-1');
    await service.enqueueFinalization('enr-1');
    expect(finalization.add).toHaveBeenCalledTimes(2);
    for (const call of finalization.add.mock.calls) {
      expect(call[2].jobId).toBeUndefined();
      expect(call[2].attempts).toBe(3);
    }
  });
});
