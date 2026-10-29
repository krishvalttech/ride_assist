// Logic-layer tests (rules, parsers, state machine, store, bridge wrapper) run
// on plain Node with babel-jest — they import no RN UI. RN/Expo native modules
// used by the bridge are mocked inside the tests.
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
  },
  moduleNameMapper: {
    "^@/src/utils/storage$": "<rootDir>/__tests__/mocks/storage.ts",
    "^@/(.*)$": "<rootDir>/$1",
  },
};
