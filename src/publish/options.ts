export function assertValidStageInput(
  stage: boolean | undefined,
  script: string | undefined,
) {
  if (stage !== undefined && script) {
    throw new Error(
      "The 'stage' input cannot be combined with a custom 'script'. Configure staged publishing inside the script instead.",
    );
  }
}
