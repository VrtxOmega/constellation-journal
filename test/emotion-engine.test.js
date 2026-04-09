const { analyze, mapToLabel, AFINN } = require('../src/emotion-engine');

describe('EmotionEngine', () => {
  describe('analyze()', () => {
    it('returns void for empty or purely whitespace strings', () => {
      expect(analyze('')).toEqual({ valence: 0, arousal: 0, label: 'void' });
      expect(analyze('   \n\t')).toEqual({ valence: 0, arousal: 0, label: 'void' });
    });

    it('returns void for non-alphabetical strings', () => {
      expect(analyze('123 456 !!! ???')).toEqual({ valence: 0, arousal: 0, label: 'void' });
    });

    it('calculates valence correctly based on AFINN', () => {
      // 'happy' = 3, 'excellent' = 3 -> totalScore = 6, matchCount = 2, avg = 3, valence = 3/5 = 0.6
      const result = analyze('I am very happy and this is excellent!');
      expect(result.valence).toBeCloseTo(0.6);
    });

    it('normalizes valence between -1 and 1', () => {
      // 'superb' = 5 -> total = 5, matchCount = 1, avg = 5, valence = 5/5 = 1.0
      expect(analyze('superb').valence).toBe(1.0);

      // 'hell' = -4, 'shit' = -4 -> total = -8, matchCount = 2, avg = -4, valence = -4/5 = -0.8
      expect(analyze('hell shit').valence).toBeCloseTo(-0.8);
    });

    it('estimates arousal based on text intensity signals', () => {
      const calm = analyze('This is a gentle serene day.');
      const intense = analyze('THIS IS A GENTLE SERENE DAY!!!');

      expect(intense.arousal).toBeGreaterThan(calm.arousal);
    });
  });

  describe('mapToLabel()', () => {
    it('maps high arousal correctly', () => {
      expect(mapToLabel(0.5, 0.8)).toBe('ecstatic');
      expect(mapToLabel(0.2, 0.8)).toBe('thrilled');
      expect(mapToLabel(-0.5, 0.8)).toBe('furious');
      expect(mapToLabel(-0.2, 0.8)).toBe('anxious');
      expect(mapToLabel(0, 0.8)).toBe('intense');
    });

    it('maps medium arousal correctly', () => {
      expect(mapToLabel(0.5, 0.5)).toBe('elated');
      expect(mapToLabel(0.2, 0.5)).toBe('hopeful');
      expect(mapToLabel(-0.5, 0.5)).toBe('distressed');
      expect(mapToLabel(-0.2, 0.5)).toBe('restless');
      expect(mapToLabel(0, 0.5)).toBe('contemplative');
    });

    it('maps low arousal correctly', () => {
      expect(mapToLabel(0.5, 0.1)).toBe('serene');
      expect(mapToLabel(0.2, 0.1)).toBe('content');
      expect(mapToLabel(-0.5, 0.1)).toBe('melancholy');
      expect(mapToLabel(-0.2, 0.1)).toBe('grieving');
      expect(mapToLabel(0, 0.1)).toBe('still');
    });
  });
});
