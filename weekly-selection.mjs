export const WEEKLY_SELECTION = Object.freeze({
  minimum: 5,
  maximum: 10,
});

export function validateWeeklySelection({ issue, candidateCount, articleCount, exception = '' }) {
  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new Error(`${issue}: candidateCount must be a non-negative integer`);
  }
  if (!Number.isInteger(articleCount) || articleCount < 0) {
    throw new Error(`${issue}: articleCount must be a non-negative integer`);
  }
  if (articleCount > WEEKLY_SELECTION.maximum) {
    throw new Error(`${issue}: at most ${WEEKLY_SELECTION.maximum} verified articles are allowed`);
  }
  if (articleCount < WEEKLY_SELECTION.minimum && !exception.trim()) {
    throw new Error(`${issue}: at least ${WEEKLY_SELECTION.minimum} verified articles are required unless an exception is documented`);
  }
}
