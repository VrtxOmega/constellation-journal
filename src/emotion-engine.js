// Constellation Journal — Emotion Engine
// VERITAS Ω: Local-only AFINN-165 lexicon. No external API. Deterministic.
// Domain: valence ∈ [-1, 1], arousal ∈ [0, 1], label ∈ finite set of emotion strings.

// AFINN-165 subset — 500 most impactful words (full 2477 embedded below would bloat this comment)
// Using a curated high-signal lexicon for fast, accurate local sentiment.
const AFINN = {
  // Strongly negative (-5 to -3)
  'abandon': -2, 'abandoned': -2, 'abuse': -3, 'abused': -3, 'abuses': -3,
  'ache': -2, 'aching': -2, 'afraid': -2, 'aggravate': -2, 'agony': -3,
  'alone': -2, 'anger': -3, 'angry': -3, 'anguish': -3, 'annoy': -2,
  'annoyed': -2, 'annoying': -2, 'anxious': -2, 'apathy': -2, 'appalling': -3,
  'ashamed': -2, 'assault': -3, 'awful': -3, 'awkward': -1,
  'bad': -3, 'bankrupt': -3, 'bastard': -5, 'battle': -1, 'beaten': -2,
  'betrayed': -3, 'bitter': -2, 'bleed': -2, 'bleeding': -2, 'blind': -1,
  'bored': -2, 'boring': -3, 'bother': -2, 'break': -1, 'broken': -2,
  'bruise': -1, 'brutal': -3, 'burden': -2, 'burn': -2, 'burning': -2,
  'catastrophe': -4, 'chaos': -3, 'collapse': -3, 'complain': -2,
  'conflict': -2, 'confused': -2, 'crash': -2, 'crazy': -2, 'cried': -2,
  'crime': -3, 'crisis': -3, 'cruel': -3, 'crush': -2, 'crushed': -2,
  'cry': -2, 'crying': -2, 'damage': -3, 'damned': -4, 'danger': -2,
  'dead': -3, 'death': -3, 'defeat': -2, 'depressed': -3, 'depression': -3,
  'despair': -3, 'desperate': -3, 'destroy': -3, 'destroyed': -3,
  'destruction': -3, 'devastated': -3, 'die': -3, 'died': -3, 'difficult': -1,
  'disaster': -3, 'disgusted': -3, 'disgusting': -3, 'dislike': -2,
  'disturbing': -2, 'doom': -3, 'doubt': -1, 'dread': -3, 'dreadful': -3,
  'drown': -3, 'drowning': -3, 'dumb': -3, 'dump': -1, 'dying': -3,
  'empty': -1, 'enemy': -2, 'enraged': -3, 'evil': -3, 'exhausted': -2,
  'fail': -2, 'failed': -2, 'failure': -2, 'fatal': -3, 'fault': -2,
  'fear': -2, 'feared': -2, 'fearful': -2, 'fight': -1, 'fired': -2,
  'fool': -2, 'foolish': -2, 'frantic': -2, 'freak': -2, 'frightened': -2,
  'frustrated': -2, 'frustrating': -2, 'fury': -3,
  'gloomy': -2, 'grief': -3, 'grieve': -3, 'grim': -2, 'gross': -2,
  'guilt': -3, 'guilty': -3,
  'harm': -2, 'hate': -3, 'hated': -3, 'hatred': -3, 'heartbreak': -3,
  'heartbroken': -3, 'helpless': -2, 'hell': -4, 'horrible': -3, 'horror': -3,
  'hostile': -2, 'humiliated': -3, 'hurt': -2, 'hurting': -2,
  'idiot': -3, 'ignorant': -2, 'ill': -2, 'impossible': -2, 'inferior': -2,
  'insane': -2, 'insecure': -2, 'irritated': -2, 'isolated': -2,
  'jealous': -2, 'jerk': -3,
  'kill': -3, 'killed': -3,
  'lame': -2, 'lazy': -1, 'lie': -2, 'lonely': -2, 'loneliness': -2,
  'lose': -2, 'loser': -3, 'losing': -2, 'loss': -3, 'lost': -2,
  'lousy': -2, 'lunatic': -3,
  'mad': -2, 'manipulate': -2, 'mess': -2, 'miserable': -3, 'misery': -3,
  'miss': -1, 'mistake': -2, 'moan': -2, 'moody': -1, 'mourn': -2,
  'murder': -3, 'murdered': -3,
  'nasty': -3, 'negative': -2, 'neglect': -2, 'nervous': -2, 'nightmare': -3,
  'numb': -1,
  'obsessed': -2, 'offended': -2, 'overwhelmed': -2,
  'pain': -2, 'painful': -2, 'panic': -3, 'pathetic': -3, 'pissed': -4,
  'poison': -3, 'poor': -2, 'poverty': -2, 'powerless': -2, 'prison': -2,
  'problem': -1, 'punish': -2, 'punished': -2,
  'rage': -3, 'regret': -2, 'reject': -2, 'rejected': -2, 'resent': -2,
  'resentment': -2, 'rotten': -3, 'rude': -2, 'ruin': -2, 'ruined': -2,
  'sad': -2, 'sadness': -2, 'savage': -2, 'scare': -2, 'scared': -2,
  'scream': -2, 'shame': -2, 'shattered': -2, 'shit': -4, 'shock': -2,
  'shocked': -2, 'sick': -2, 'sin': -2, 'slam': -1, 'slap': -2,
  'sob': -2, 'sobbing': -2, 'sorrow': -3, 'sorry': -1, 'spite': -2,
  'stab': -3, 'stress': -2, 'stressed': -2, 'struggle': -2, 'stupid': -3,
  'suck': -3, 'suffer': -2, 'suffering': -2, 'suicide': -4, 'suspect': -1,
  'tear': -1, 'tears': -2, 'terrible': -3, 'terrified': -3, 'terror': -3,
  'threat': -2, 'torment': -3, 'torture': -3, 'toxic': -3, 'tragedy': -3,
  'tragic': -3, 'trap': -1, 'trapped': -2, 'trauma': -3, 'trouble': -2,
  'ugly': -3, 'unhappy': -2, 'upset': -2, 'useless': -2,
  'victim': -3, 'violent': -3, 'void': -1, 'vulnerable': -2,
  'war': -2, 'weak': -2, 'weary': -2, 'weep': -2, 'weird': -1,
  'wicked': -2, 'worthless': -3, 'wound': -2, 'wounded': -2, 'wreck': -2,
  'wretched': -3, 'wrong': -2,
  // Strongly positive (+3 to +5)
  'accomplish': 2, 'accomplished': 2, 'achievement': 3, 'admire': 3,
  'adorable': 3, 'adore': 3, 'adventure': 2, 'affection': 3, 'alive': 1,
  'amaze': 3, 'amazed': 3, 'amazing': 4, 'amused': 2, 'angel': 2,
  'appreciate': 2, 'appreciated': 2, 'awesome': 4,
  'beautiful': 3, 'beauty': 3, 'believe': 1, 'beloved': 3, 'best': 3,
  'bless': 2, 'blessed': 3, 'bliss': 3, 'bloom': 1, 'bold': 2,
  'bonus': 2, 'brave': 2, 'breakthrough': 3, 'breathtaking': 5, 'bright': 1,
  'brilliant': 4, 'calm': 2, 'care': 2, 'celebrate': 3, 'celebration': 3,
  'champion': 3, 'charming': 3, 'cheer': 2, 'cheerful': 2, 'cherish': 3,
  'clarity': 2, 'comfort': 2, 'committed': 1, 'compassion': 3, 'confident': 2,
  'conquer': 2, 'content': 1, 'cool': 1, 'courage': 2, 'courageous': 3,
  'create': 1, 'creative': 2, 'cuddle': 2, 'cure': 2,
  'dance': 1, 'dazzle': 3, 'dear': 2, 'delight': 3, 'delighted': 3,
  'delightful': 3, 'determined': 2, 'devoted': 2, 'divine': 3, 'dream': 1,
  'eager': 2, 'ecstasy': 4, 'ecstatic': 4, 'elegant': 2, 'embrace': 2,
  'empower': 2, 'enchanted': 2, 'encourage': 2, 'encouraged': 2,
  'energetic': 2, 'energy': 1, 'enjoy': 2, 'enjoyable': 2, 'enlighten': 2,
  'enthusiasm': 3, 'euphoria': 4, 'euphoric': 4, 'excel': 2, 'excellent': 3,
  'excite': 3, 'excited': 3, 'exciting': 3, 'extraordinary': 4,
  'fabulous': 4, 'faith': 2, 'family': 1, 'fan': 1, 'fantastic': 4,
  'fascinate': 3, 'favor': 1, 'favorite': 2, 'fearless': 2, 'fine': 1,
  'flourish': 2, 'fly': 1, 'fond': 2, 'forgive': 2, 'free': 2,
  'freedom': 2, 'fresh': 1, 'friend': 1, 'friendly': 2, 'friendship': 2,
  'fulfill': 2, 'fun': 4, 'funny': 2,
  'gentle': 2, 'genuine': 2, 'gift': 2, 'giggle': 2, 'glad': 3,
  'glow': 1, 'glory': 3, 'golden': 2, 'good': 3, 'gorgeous': 4,
  'grace': 2, 'graceful': 3, 'grand': 3, 'grateful': 3, 'great': 3,
  'grin': 2, 'grow': 1, 'growth': 2,
  'happy': 3, 'happiness': 3, 'harmony': 2, 'heal': 2, 'healing': 2,
  'healthy': 2, 'heart': 1, 'heaven': 2, 'heavenly': 4, 'hero': 2,
  'heroic': 3, 'hilarious': 2, 'honest': 2, 'honor': 2, 'hope': 2,
  'hopeful': 2, 'hug': 2, 'humble': 1,
  'ideal': 2, 'imaginative': 2, 'impress': 3, 'impressed': 3, 'impressive': 3,
  'incredible': 4, 'independent': 2, 'innocent': 2, 'innovation': 2,
  'inspire': 3, 'inspired': 3, 'inspiring': 3, 'integrity': 2,
  'intelligent': 2, 'interested': 1, 'interesting': 2,
  'jolly': 2, 'joy': 3, 'joyful': 3, 'joyous': 4, 'jubilant': 3,
  'keen': 1, 'kind': 2, 'kindness': 3, 'kiss': 2,
  'laugh': 2, 'laughing': 2, 'laughter': 2, 'lead': 1, 'legend': 2,
  'legendary': 3, 'liberate': 2, 'liberty': 2, 'light': 1, 'lively': 2,
  'love': 3, 'loved': 3, 'lovely': 3, 'loving': 3, 'loyal': 2, 'lucky': 3,
  'magic': 3, 'magical': 3, 'magnificent': 4, 'marvel': 3, 'marvelous': 3,
  'master': 2, 'meaningful': 2, 'merry': 3, 'miracle': 4, 'motivate': 2,
  'noble': 2, 'nurture': 2,
  'optimism': 2, 'optimistic': 2, 'outstanding': 5, 'overcome': 2, 'overjoyed': 4,
  'paradise': 3, 'passion': 2, 'passionate': 3, 'patience': 2, 'peace': 2,
  'peaceful': 2, 'perfect': 3, 'phenomenal': 4, 'play': 1, 'playful': 2,
  'pleasant': 2, 'pleased': 2, 'pleasure': 3, 'positive': 2, 'power': 1,
  'powerful': 2, 'praise': 3, 'precious': 3, 'pride': 2, 'progress': 2,
  'promise': 1, 'prosper': 2, 'protect': 1, 'proud': 2, 'pure': 2,
  'radiant': 3, 'reassure': 2, 'refresh': 1, 'rejoice': 4, 'relax': 2,
  'relaxed': 2, 'relief': 2, 'remarkable': 3, 'rescue': 2, 'resilient': 2,
  'respect': 2, 'restore': 1, 'reward': 2, 'rich': 2,
  'safe': 1, 'satisfy': 2, 'satisfied': 2, 'save': 1, 'secure': 2,
  'serene': 2, 'shine': 2, 'shining': 2, 'sincere': 2, 'smile': 2,
  'smiling': 2, 'smooth': 1, 'soothe': 2, 'soul': 1, 'sparkle': 2,
  'spectacular': 4, 'spirit': 1, 'splendid': 3, 'strong': 2, 'stunning': 4,
  'succeed': 3, 'success': 3, 'successful': 3, 'sun': 1, 'sunshine': 2,
  'superb': 5, 'support': 2, 'surprise': 1, 'sweet': 2, 'sweetheart': 3,
  'talent': 2, 'talented': 2, 'tender': 2, 'terrific': 4, 'thankful': 2,
  'thanks': 2, 'thrill': 3, 'thrilled': 3, 'thriving': 3, 'together': 1,
  'top': 1, 'transform': 1, 'treasure': 2, 'tremendous': 4, 'triumph': 4,
  'true': 2, 'trust': 2, 'truth': 1,
  'unique': 2, 'unite': 1, 'uplift': 2,
  'valor': 3, 'value': 1, 'vibrant': 3, 'victory': 3,
  'warm': 1, 'warmth': 2, 'wealth': 2, 'welcome': 2, 'well': 1,
  'wholesome': 3, 'win': 4, 'winner': 2, 'wisdom': 2, 'wise': 2,
  'wish': 1, 'wonder': 2, 'wonderful': 4, 'worthy': 2,
  'yay': 3, 'yes': 1,
  'zeal': 2, 'zealous': 2, 'zen': 2
};

// Maximum possible absolute score for normalization
const MAX_AFINN_ABS = 5;

/**
 * Analyze text for emotional content.
 * @param {string} text — journal entry text
 * @returns {{ valence: number, arousal: number, label: string }}
 *   valence ∈ [-1, 1], arousal ∈ [0, 1]
 */
function analyze(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { valence: 0, arousal: 0, label: 'void' };
  }

  const words = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { valence: 0, arousal: 0, label: 'void' };
  }

  // Compute raw valence from AFINN matches
  let totalScore = 0;
  let matchCount = 0;
  for (const word of words) {
    if (AFINN.hasOwnProperty(word)) {
      totalScore += AFINN[word];
      matchCount++;
    }
  }

  // Normalize valence to [-1, 1]
  // Use per-matched-word average, then normalize by MAX_AFINN_ABS
  let valence = 0;
  if (matchCount > 0) {
    valence = (totalScore / matchCount) / MAX_AFINN_ABS;
    valence = Math.max(-1, Math.min(1, valence));
  }

  // Estimate arousal from textual intensity signals
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
  const exclamationDensity = (text.match(/!/g) || []).length / Math.max(1, words.length);
  const questionDensity = (text.match(/\?/g) || []).length / Math.max(1, words.length);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const wordLengthFactor = Math.min(1, (avgWordLength - 3) / 7); // longer words = higher arousal

  let arousal =
    0.25 * Math.min(1, capsRatio * 10) +
    0.30 * Math.min(1, exclamationDensity * 5) +
    0.15 * Math.min(1, questionDensity * 5) +
    0.15 * Math.abs(valence) +  // extreme valence correlates with arousal
    0.15 * Math.max(0, wordLengthFactor);
  arousal = Math.max(0, Math.min(1, arousal));

  // Map to emotion label
  const label = mapToLabel(valence, arousal);

  return { valence, arousal, label };
}

/**
 * Map valence/arousal to an emotion label.
 * Uses the circumplex model (Russell, 1980) — 2D emotion space.
 */
function mapToLabel(valence, arousal) {
  // High arousal
  if (arousal > 0.6) {
    if (valence > 0.3) return 'ecstatic';
    if (valence > 0.1) return 'thrilled';
    if (valence < -0.3) return 'furious';
    if (valence < -0.1) return 'anxious';
    return 'intense';
  }
  // Medium arousal
  if (arousal > 0.3) {
    if (valence > 0.3) return 'elated';
    if (valence > 0.1) return 'hopeful';
    if (valence < -0.3) return 'distressed';
    if (valence < -0.1) return 'restless';
    return 'contemplative';
  }
  // Low arousal
  if (valence > 0.3) return 'serene';
  if (valence > 0.1) return 'content';
  if (valence < -0.3) return 'melancholy';
  if (valence < -0.1) return 'grieving';
  return 'still';
}

module.exports = { analyze, mapToLabel, AFINN };
