import { describe, expect, it } from 'vitest';
import { t } from './messages';

describe('message catalogue', () => {
  it('uses the prototype wording', () => {
    expect(t('queue.scanTitle')).toBe('Scan a batch card to begin');
    expect(t('queue.scanHint', { time: '06:12' })).toBe(
      'Or touch a row below. Queue received from OrgaTEX at 06:12.',
    );
    expect(t('strip.scale', { capacity: '3 kg' })).toBe('SCALE 3 kg');
    expect(t('state.CAL_EXPIRED')).toBe('CAL EXPIRED');
    expect(t('state.OUT_OF_PAPER')).toBe('OUT OF PAPER');
  });

  it('fills placeholders and keeps unknown ones visible', () => {
    expect(t('brand.station', { station: '01' })).toBe('STATION 01');
    expect(t('crumb.batch')).toBe('BATCH');
    expect(t('queue.selecting', {})).toBe('Opening batch {batchId}…');
  });
});
