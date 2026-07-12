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
  'no-unused-vars': 'off',
};

export default [
  {
    files: ['game.js', 'logic.js', 'monsters-data.js'],
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
