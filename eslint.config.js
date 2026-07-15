import globals from 'globals';

// โฟกัสจับบั๊กจริง (อ้างอิงชื่อที่ไม่มีจริง เช่น grantMegaStone, คีย์ซ้ำ, โค้ดที่ไปไม่ถึง)
// ไม่เข้มเรื่องสไตล์ เพื่อไม่ให้ CI แดงเพราะเรื่องจุกจิกในโค้ดเดิม
const bugRules = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-func-assign': 'error',
  'no-unreachable': 'error',
  // กฎจับบั๊กเพิ่มเติม (ความเสี่ยง false-positive ต่ำ แต่จับพลาดจริงได้)
  'use-isnan': 'error',                    // x === NaN (ผิดเสมอ)
  'valid-typeof': 'error',                 // typeof x === 'stirng' (พิมพ์ผิด)
  'no-dupe-else-if': 'error',              // เงื่อนไข else-if ซ้ำ
  'no-self-compare': 'error',              // x === x
  'no-unsafe-negation': 'error',           // !a in b
  'no-compare-neg-zero': 'error',          // x === -0
  'no-constant-binary-expression': 'error',// เงื่อนไข logic ที่คงที่เสมอ
  'no-useless-backreference': 'error',     // regex backreference ที่ไม่ทำงาน
  'no-unused-vars': 'off',
};

export default [
  {
    files: ['game.js', 'logic.js', 'monsters-data.js', 'abilities-data.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: bugRules,
  },
  {
    files: ['cloud.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: bugRules,
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: bugRules,
  },
];
