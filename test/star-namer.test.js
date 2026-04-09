const { generate, emotionToTemperature, temperatureToHex } = require('../src/star-namer');

describe('StarNamer', () => {
  describe('emotionToTemperature()', () => {
    it('returns red supergiant temps for high arousal', () => {
      const temp = emotionToTemperature({ valence: 0, arousal: 0.8 });
      expect(temp).toBeGreaterThanOrEqual(3000);
      expect(temp).toBeLessThan(4000);
    });

    it('returns blue giant temps for negative valence', () => {
      const temp = emotionToTemperature({ valence: -0.5, arousal: 0.2 });
      expect(temp).toBeGreaterThanOrEqual(10000);
      expect(temp).toBeLessThanOrEqual(30000);
    });

    it('returns yellow dwarf temps for positive valence', () => {
      const temp = emotionToTemperature({ valence: 0.5, arousal: 0.2 });
      expect(temp).toBeGreaterThanOrEqual(4500);
      expect(temp).toBeLessThanOrEqual(6000);
    });

    it('returns neutral temps for neutral emotion', () => {
      const temp = emotionToTemperature({ valence: 0.1, arousal: 0.2 });
      expect(temp).toBeGreaterThanOrEqual(6000);
      expect(temp).toBeLessThanOrEqual(9000);
    });
  });

  describe('temperatureToHex()', () => {
    it('converts temperature to valid hex color string', () => {
      const hex = temperatureToHex(5000);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('returns reddish hex for low temps', () => {
      const hex = temperatureToHex(3000);
      // Red should be high (ff)
      expect(hex.startsWith('#ff')).toBe(true);
    });

    it('returns bluish hex for high temps', () => {
      const hex = temperatureToHex(15000);
      // Blue should be high (ff)
      expect(hex.endsWith('ff')).toBe(true);
    });
  });

  describe('generate()', () => {
    it('generates a deterministically stable name', () => {
      const emotion = { valence: 0.8, arousal: 0.2, label: 'content' };
      const name1 = generate(emotion);
      const name2 = generate(emotion);
      expect(name1).toBe(name2);
    });

    it('generates a string with greek and constellation name', () => {
      const emotion = { valence: -0.5, arousal: 0.8, label: 'furious' };
      const name = generate(emotion);
      expect(typeof name).toBe('string');
      expect(name).toMatch(/^[A-Za-z]+ [A-Za-z\s]+$/);
    });
  });
});
