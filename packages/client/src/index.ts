/**
 * The read layer, shared by the public app and the admin app.
 *
 * Both talk to the same API and format the same numbers, and two copies of
 * `formatUsd` is how one of them ends up rounding a balance differently from
 * the other. Everything here is transport and presentation of data — no
 * components, no wallet, so either app can pull it in without dragging the
 * other's dependencies along.
 */
export * from "./api";
export * from "./format";
export * from "./hooks";
