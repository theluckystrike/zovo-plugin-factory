/* Sample code for the Code Screenshot page (a short TypeScript function). */
export const SAMPLE = { name: 'retry.ts', highlight: 9, data: `// Retry a promise with exponential backoff.
export async function retry<T>(
  task: () => Promise<T>,
  attempts = 4,
  baseMs = 250,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      const wait = baseMs * 2 ** i + Math.random() * 100;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(\`Failed after \${attempts} attempts: \${String(lastError)}\`);
}
` };
