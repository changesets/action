/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {},
  transformIgnorePatterns: ["/node_modules/(?!unified/)"],
};
