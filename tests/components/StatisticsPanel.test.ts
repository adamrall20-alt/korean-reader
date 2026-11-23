import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import StatisticsPanel from '@/components/StatisticsPanel.vue';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  },
}));

describe('StatisticsPanel', () => {
  it('renders one continuous chart stroke and prioritises review stats for the selected deck', async () => {
    sendMessage.mockImplementation(async ({ type }) => type === 'get-known-word-history'
      ? {
        ok: true,
        history: {
          baseline: { at: 0, count: 13_307 },
          days: [{ at: 100, count: 13_314 }, { at: 200, count: 13_328 }],
        },
      }
      : {
        ok: true,
        deckStatistics: {
          deckName: 'Korean::Vocabulary', reviewsToday: 0, reviewsNextWeek: null, coverage: null,
          history: { totalReviews: 120, reviewMilliseconds: 4_200_000 },
        },
      });

    const wrapper = mount(StatisticsPanel);
    await flushPromises();
    const line = wrapper.get('.reader-chart-line');
    expect(line.attributes('d')).toBe('M0 92 H50 V64 H100 V8');
    expect(line.attributes('pathLength')).toBeUndefined();
    expect(wrapper.get('#anki-deck-heading').text()).toContain('Korean::Vocabulary');
    const primaryStats = wrapper.get('section[aria-labelledby="anki-deck-heading"] dl');
    expect(primaryStats.findAll('dt').map((cell) => cell.text())).toEqual([
      'Reviews left today', 'Total reviews done', 'Time spent reviewing',
    ]);
    expect(primaryStats.findAll('dd').map((cell) => cell.text())).toEqual(['0', '120', '1 h 10 min']);
  });

  it('keeps the selected deck visible during a connection error and refreshes when Anki is available', async () => {
    let connected = false;
    sendMessage.mockImplementation(async ({ type }) => {
      if (type === 'get-known-word-history') return { ok: true, history: null };
      if (!connected) return { ok: false, deckName: 'Korean', error: 'Open Anki Desktop.' };
      return {
        ok: true,
        deckStatistics: {
          deckName: 'Korean', reviewsToday: 10, reviewsNextWeek: 24, coverage: null, history: null,
        },
      };
    });

    const wrapper = mount(StatisticsPanel);
    await flushPromises();
    const deck = wrapper.get('section[aria-labelledby="anki-deck-heading"]');
    expect(deck.get('h2').text()).toContain('Korean');
    expect(deck.get('[role="alert"]').text()).toBe('Open Anki Desktop.');
    expect(deck.get('a').attributes('href')).toBe('/options.html#anki');

    connected = true;
    await deck.get('button').trigger('click');
    await flushPromises();
    expect(deck.find('[role="alert"]').exists()).toBe(false);
    expect(deck.get('dd').text()).toBe('10');
    expect(deck.get('dl').text()).toContain('History unavailable');
  });
});
