import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createTrackSchema, type UpdateTrackDto } from '@lms/shared';
import type { AdminTrack } from '@/lib/admin-types';
import type { RefOptions } from '@/components/admin/item-editor';
import { TrackBuilder } from '@/components/admin/track-builder';

const REF_OPTIONS: RefOptions = {
  lessons: [{ _id: 'l1', title: 'Intro lesson' }],
  materials: [],
  problems: [{ _id: 'p1', title: 'Sum problem' }],
  categories: [{ _id: 'cat1', name: 'Logical' }],
};

const TRACK: AdminTrack = {
  _id: 't1',
  title: 'Onboarding',
  description: 'A short track',
  durationDays: 2,
  days: [
    { dayNumber: 1, items: [{ itemId: 'i1', type: 'lesson', refId: 'l1', config: {} }] },
    { dayNumber: 2, items: [] },
  ],
  scoring: {
    weights: { quiz: 0, coding: 0, exercise: 1, reading: 0, finalAssessment: 0 },
    passThreshold: 0.7,
  },
  status: 'draft',
};

describe('TrackBuilder', () => {
  it('adds a day item and saves a schema-valid dto with no invented itemId', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackBuilder
        track={TRACK}
        refOptions={REF_OPTIONS}
        onSave={onSave}
        onPublish={vi.fn()}
      />,
    );

    // Day 2 gets an exercise item.
    await userEvent.click(screen.getAllByRole('button', { name: /add exercise/i })[1]);
    await userEvent.type(screen.getByLabelText('Instructions'), 'Write a summary.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const dto = onSave.mock.calls[0][0] as UpdateTrackDto;
    expect(createTrackSchema.safeParse(dto).success).toBe(true);
    const day2 = dto.days![1];
    expect(day2.items).toHaveLength(1);
    expect(day2.items[0].type).toBe('exercise');
    expect(day2.items[0].config.instructions).toBe('Write a summary.');
    // itemId is server-generated; drafts must not invent one.
    expect(day2.items[0]).not.toHaveProperty('itemId');
  });

  it('publish is blocked while dirty and surfaces API errors verbatim once saved', async () => {
    const onPublish = vi.fn().mockRejectedValue(new Error('lesson item requires refId'));
    render(
      <TrackBuilder
        track={TRACK}
        refOptions={REF_OPTIONS}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onPublish={onPublish}
      />,
    );

    expect(screen.getByRole('button', { name: /publish/i })).toBeEnabled();

    // Dirty the draft → publish disables until saved.
    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('button', { name: /publish/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /publish/i }));
    expect(await screen.findByText('lesson item requires refId')).toBeInTheDocument();
  });

  it('saving with a capstone carries finalAssessment in the dto', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackBuilder
        track={TRACK}
        refOptions={REF_OPTIONS}
        onSave={onSave}
        onPublish={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /enable final assessment/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sum problem' }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const dto = onSave.mock.calls[0][0] as UpdateTrackDto;
    expect(dto.finalAssessment).toEqual({ codingProblemIds: ['p1'] });
    expect(createTrackSchema.safeParse(dto).success).toBe(true);
  });

  it('disabling a saved capstone sends finalAssessment: null so the server can unset it', async () => {
    const trackWithCapstone: AdminTrack = {
      ...TRACK,
      finalAssessment: { codingProblemIds: ['p1'] },
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackBuilder
        track={trackWithCapstone}
        refOptions={REF_OPTIONS}
        onSave={onSave}
        onPublish={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /enable final assessment/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const dto = onSave.mock.calls[0][0] as UpdateTrackDto;
    // Omitting the key would leave the stored capstone in place (PATCH merge);
    // null is the explicit unset signal.
    expect(dto.finalAssessment).toBeNull();
  });

  it('renders a saved track whose items have no config key (mongoose minimize strips {})', async () => {
    // The API serializes items created with config:{} WITHOUT a config key at
    // all — the builder must not crash re-opening such a draft.
    const serverTrack = {
      ...TRACK,
      days: [{ dayNumber: 1, items: [{ itemId: 'i1', type: 'lesson', refId: 'l1' }] }],
    } as unknown as AdminTrack;
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackBuilder
        track={serverTrack}
        refOptions={REF_OPTIONS}
        onSave={onSave}
        onPublish={vi.fn()}
      />,
    );

    // Renders with defaults instead of throwing.
    expect(screen.getByRole('checkbox', { name: 'Required' })).toBeChecked();

    // And the config-less item still saves a schema-valid dto.
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const dto = onSave.mock.calls[0][0] as UpdateTrackDto;
    expect(createTrackSchema.safeParse(dto).success).toBe(true);
  });

  it('shrinking durationDays hides days without destroying them; drop happens only at save with confirm', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <TrackBuilder track={TRACK} refOptions={REF_OPTIONS} onSave={onSave} onPublish={vi.fn()} />,
    );

    const duration = screen.getByLabelText('Duration (days)');
    // fireEvent.change sets the exact value — userEvent.type appends into a
    // controlled number input (P6 harness wart).
    fireEvent.change(duration, { target: { value: '1' } });
    expect(screen.queryByText('Day 2')).not.toBeInTheDocument();

    fireEvent.change(duration, { target: { value: '2' } });
    expect(screen.getByText('Day 2')).toBeInTheDocument();
    // Day 1's item survived the shrink/restore round-trip.
    expect(screen.getAllByText(/lesson/i).length).toBeGreaterThan(0);

    // Now shrink to 1 and SAVE — the (empty) day 2 is dropped without confirm;
    // dto carries exactly one day.
    fireEvent.change(duration, { target: { value: '1' } });
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const dto = onSave.mock.calls[0][0] as UpdateTrackDto;
    expect(dto.durationDays).toBe(1);
    expect(dto.days).toHaveLength(1);
    expect(confirmSpy).not.toHaveBeenCalled(); // dropped day was empty
    confirmSpy.mockRestore();
  });
});
