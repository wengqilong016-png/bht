/**
 * jest.vite-transform.cjs
 *
 * A thin Jest transform wrapper that replaces Vite-specific `import.meta.env.*`
 * references with `process.env.*` equivalents before handing the source to
 * ts-jest for TypeScript compilation.  This lets us test modules that use
 * Vite's build-time env substitution in the Jest (CommonJS) environment.
 */
'use strict';

const { TsJestTransformer } = require('ts-jest');

const transformer = new TsJestTransformer({
  tsconfig: {
    jsx: 'react-jsx',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  },
});

module.exports = {
  process(sourceText, sourcePath, options) {
    // Replace `import.meta.env.VITE_*` with `(process.env.VITE_* ?? '')`
    const preprocessed = sourceText.replace(
      /import\.meta\.env\.([A-Z0-9_]+)/g,
      (_match, key) => `(process.env.${key} ?? '')`,
    );
    return transformer.process(preprocessed, sourcePath, options);
  },
  getCacheKey(sourceText, sourcePath, options) {
    const preprocessed = sourceText.replace(
      /import\.meta\.env\.([A-Z0-9_]+)/g,
      (_match, key) => `(process.env.${key} ?? '')`,
    );
    return transformer.getCacheKey(preprocessed, sourcePath, options);
  },
};
