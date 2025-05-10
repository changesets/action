import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import { throttling } from "@octokit/plugin-throttling";

export const setupOctokit = (githubToken: string) => {
  return getOctokit(
    githubToken,
    {
      throttle: {
        onRateLimit: (retryAfter, options: any, octokit, retryCount) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (
          retryAfter,
          options: any,
          octokit,
          retryCount
        ) => {
          core.warning(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
      },
    },
    throttling
  );
};

export type Octokit = ReturnType<typeof setupOctokit>;
