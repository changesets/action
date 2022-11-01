module.exports = (api) => {
  if (api.env("test"))
    return {
      plugins: [
        [
          "@babel/plugin-transform-modules-commonjs",
          {
            importInterop: "none",
          },
        ],
      ],
    };

  return {};
};
