// The crew from Rack Runner. Atlas layout (4x3): frames 0-7 run cycle,
// 8 jump, 9 slide, 10 portrait (front), 11 idle (back).
export const CHARACTERS = [
  {
    id: 'technician', name: 'הטכנאי', description: 'טכנאי דאטה סנטר. תמיד עם התיק.', atlas: 'technician', height: 1.78,
    portraitFrame: 11,
    power: {
      id: 'magnet', name: 'מגנט QSFP', duration: 8,
      description: 'אוספים Power-up: כל מודולי ה־QSFP בכל הנתיבים נמשכים אליך ל־8 שניות.',
      active: 'מגנט QSFP פעיל!',
      activate(run) { run.magnet = true; }, finish(run) { run.magnet = false; },
    },
  },
  {
    id: 'avichai', name: 'אביחי', description: 'גדול ממדים. גדול על הדאטה סנטר.', atlas: 'avichai', height: 1.82,
    power: {
      id: 'giant', name: 'אביחי הענק', duration: 8,
      description: 'אוספים Power-up: 8 שניות של ענק בלתי מנוצח שמועך כל ציוד בדרך.',
      active: 'אביחי הענק! 8 שניות ללא מעצורים',
      activate(run) { run.invincible = true; run.giant = true; }, finish(run) { run.invincible = false; run.giant = false; },
    },
  },
  {
    id: 'ariel', name: 'אריאל', description: 'גדול ממדים, עם כיפה לבנה.', atlas: 'ariel', height: 1.8, rollAtlas: 'ariel-roll',
    power: {
      id: 'roll', name: 'אריאל מתגלגל', duration: 8,
      description: 'אוספים Power-up: הופכים לכדור מתגלגל ל־8 שניות ומפילים מכשולים בנתיב.',
      active: 'אריאל מתגלגל! 8 שניות על המסלול',
      activate(run) { run.rolling = true; run.invincible = true; }, finish(run) { run.rolling = false; run.invincible = false; },
    },
  },
  {
    id: 'liad', name: 'ליעד', description: 'גבוה במיוחד. מגיע לכל QSFP.', atlas: 'liad', height: 1.95, powerAtlas: 'liad-rubber',
    power: {
      id: 'elastic', name: 'ליעד הגמיש', duration: 8,
      description: 'אוספים Power-up: הידיים מתארכות וכל מודולי ה־QSFP מכל הנתיבים נמשכים אליו.',
      active: 'ליעד הגמיש! הידיים מגיעות לכל נתיב',
      activate(run) { run.magnet = true; run.elastic = true; }, finish(run) { run.magnet = false; run.elastic = false; },
    },
  },
  {
    id: 'gabi', name: 'גבי', description: 'חולצה לבנה, ציציות וכיפה שחורה גדולה.', atlas: 'gabi', height: 1.76,
    power: {
      id: 'prayer', name: 'כוח התפילה', duration: 8,
      description: 'אוספים Power-up: הדאטה סנטר בוהק בלבן ומודולי ה־QSFP נמשכים אל גבי.',
      active: 'כוח התפילה! אור לבן ומגנט QSFP',
      activate(run) { run.prayer = true; run.magnet = true; run.invincible = true; },
      finish(run) { run.prayer = false; run.magnet = false; run.invincible = false; },
    },
  },
];

export const getCharacter = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

export const HOST_LINES = {
  start: ['יאללה {name}, תחזור עם QSFP!', 'המשמרת שלך, {name}. אני סומך עליך!', 'השרתים מסודרים. עכשיו תורך לאסוף!'],
  record: ['שיא חדש! ככה עושים משמרת!', '{name}, עקפת את עצמך. תמשיך ככה!', 'את זה אני מכניס לדוח המשמרת!'],
  failure: ['לא נורא, {name}. מתאפסים וחוזרים למסלול.', 'ה־QSFP עוד מחכים לנו. עוד משמרת?', '{chips} מודולים נאספו. בפעם הבאה נביא יותר!'],
  stumble: ['זהירות! ההשבתה מאחוריך!', 'תרים רגליים, {name}!', 'עוד מעידה אחת והמערכת נופלת!'],
  turn: ['פנייה! תבחר כיוון!', 'שמאלה או ימינה, {name}?'],
};
