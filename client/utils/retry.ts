type RetryOptionsType = {
  attempts?: number;
  delay?: number;
  limit?: number;
  exponential?: boolean;
};

export const retry = async (action: () => void | Promise<void>, options: RetryOptionsType = {}) => {
  const localOptions = Object.assign({ attempts: 5, delay: 1000, limit: 5000 } satisfies RetryOptionsType, options);

  let attempts = 0;
  while (attempts < localOptions.attempts) {
    try {
      await action();

      return;
    } catch (error) {
      attempts++;

      if (attempts >= localOptions.attempts) throw error;

      const delay = Math.min(
        localOptions.delay * (localOptions.exponential ? 2 ** (attempts - 1) : attempts),
        localOptions.limit,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
