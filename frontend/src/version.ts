/**
 * Nuvis Flipex release metadata.
 *
 * Nothing here is edited by hand: the values are injected at build time from the repo-root
 * VERSION file (see vite.config.ts). Run `node scripts/bump-version.mjs patch|minor|major`
 * to cut a new release.
 */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_BUILD: string = __APP_BUILD__;
export const APP_COMMIT: string = __APP_COMMIT__;
export const APP_BUILT_AT: string = __APP_BUILT_AT__;
export const APP_NAME = 'Nuvis Flipex';
export const APP_FULL_VERSION = `v${APP_VERSION}`;
export const APP_RELEASE_STAGE = 'Enterprise GA';
