/**
 * The contracts package's TypeScript face.
 *
 * Solidity lives in `src/`, its generated ABIs in `ts/abi.ts`. Everything the
 * rest of the monorepo needs to talk to a vault — ABIs, the enums the events
 * encode, and the units those numbers are in — is re-exported from here, so no
 * other package ever reaches into a Forge artifact directly.
 */
export * from "./abi";
export * from "./types";
