const { detect } = require('../src/constellation-engine');

describe('ConstellationEngine', () => {
  describe('detect()', () => {
    it('returns an empty array for fewer than 3 entries', () => {
      expect(detect([])).toEqual([]);
      expect(detect([{ day_of_year: 1, emotion_valence: 0, emotion_arousal: 0, emotion_label: 'still' }])).toEqual([]);
      expect(detect([
        { day_of_year: 1, emotion_valence: 0, emotion_arousal: 0, emotion_label: 'still' },
        { day_of_year: 2, emotion_valence: 0.5, emotion_arousal: 0.5, emotion_label: 'happy' }
      ])).toEqual([]);
    });

    it('returns constellations when entries form clusters', () => {
      const entries = [
        { day_of_year: 1, emotion_valence: 0.8, emotion_arousal: 0.2, emotion_label: 'serene' },
        { day_of_year: 2, emotion_valence: 0.9, emotion_arousal: 0.1, emotion_label: 'serene' },
        { day_of_year: 3, emotion_valence: 0.85, emotion_arousal: 0.15, emotion_label: 'serene' },
      ];

      const constellations = detect(entries);
      expect(constellations.length).toBeGreaterThan(0);
      expect(constellations[0]).toHaveProperty('name');
      expect(constellations[0]).toHaveProperty('theme');
      expect(constellations[0].theme).toBe('serene');
      expect(constellations[0]).toHaveProperty('starDays');
      expect(constellations[0].starDays.length).toBe(3);
      expect(constellations[0]).toHaveProperty('linePairs');
    });
  });
});
