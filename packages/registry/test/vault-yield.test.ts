import { describe, expect, test } from "bun:test";
import type { Market } from "@lemon/core";
import { projectVaultApy } from "../src/vault-yield";

const market: Market = {
	symbol: "NVDA/USD",
	base: "NVDA",
	quote: "USD",
	assetClass: "equity",
	minLeverage: 1,
	maxLeverage: 5,
	minPositionUsdc: 100,
	openInterest: 86_842,
	maxOpenInterest: 1_578_105,
	availableOpenInterest: 1_491_263,
	isListed: true,
	closeOnly: false,
	isOpen: true,
	nextOpen: null,
	nextClose: null,
};

/** The conservative tier's terms, which is what most vaults are created with. */
const conservative = {
	fundingShortPercentPerHour: 0.001, // 8.76% a year on notional
	leverage: 1,
	deployedFraction: 0.9,
	managementFeeBps: 200,
	performanceFeeBps: 2000,
	market,
};

describe("projectVaultApy", () => {
	test("annualises the hourly rate the venue quotes", () => {
		const p = projectVaultApy(conservative);
		expect(p.fundingAprPercent).toBeCloseTo(0.001 * 24 * 365, 6);
	});

	test("halves the yield at 1x, because half the capital is margin", () => {
		// Funding accrues on notional. Unlevered, a depositor funds an equal
		// amount of spot and of margin, so the yield on capital is half the yield
		// on notional — the single most common way a projection is doubled.
		const p = projectVaultApy(conservative);
		expect(p.grossApyPercent).toBeCloseTo(p.fundingAprPercent / 2, 6);
	});

	test("leverage raises the yield on capital towards the yield on notional", () => {
		const at1x = projectVaultApy({ ...conservative, leverage: 1 });
		const at3x = projectVaultApy({ ...conservative, leverage: 3 });

		// L/(1+L): 1/2 at 1x, 3/4 at 3x. It approaches the funding APR but never
		// reaches it, because margin always has to be posted.
		expect(at3x.grossApyPercent).toBeCloseTo((at3x.fundingAprPercent * 3) / 4, 6);
		expect(at3x.grossApyPercent).toBeGreaterThan(at1x.grossApyPercent);
		expect(at3x.grossApyPercent).toBeLessThan(at3x.fundingAprPercent);
	});

	test("the idle buffer dilutes the yield in proportion", () => {
		const full = projectVaultApy({ ...conservative, deployedFraction: 1 });
		const buffered = projectVaultApy({ ...conservative, deployedFraction: 0.9 });
		expect(buffered.afterBufferApyPercent).toBeCloseTo(full.afterBufferApyPercent * 0.9, 6);
	});

	test("each step only ever takes away", () => {
		const p = projectVaultApy(conservative);
		expect(p.afterBufferApyPercent).toBeLessThanOrEqual(p.grossApyPercent);
		expect(p.afterCostsApyPercent).toBeLessThan(p.afterBufferApyPercent);
		expect(p.afterManagementApyPercent).toBeLessThan(p.afterCostsApyPercent);
		expect(p.netApyPercent).toBeLessThanOrEqual(p.afterManagementApyPercent);
	});

	test("the management fee is the full rate, not scaled by what is deployed", () => {
		// A depositor pays it on everything they put in, whether or not the vault
		// has put it to work. Scaling it by the deployed fraction would quietly
		// under-report the fee on exactly the vaults that hold the most idle.
		const p = projectVaultApy({ ...conservative, deployedFraction: 0.5 });
		expect(p.managementFeePercent).toBe(2);
		expect(p.afterCostsApyPercent - p.afterManagementApyPercent).toBeCloseTo(2, 9);
	});

	test("the performance fee takes a fifth of what is left", () => {
		const p = projectVaultApy(conservative);
		expect(p.performanceFeeDragPercent).toBeCloseTo(p.afterManagementApyPercent * 0.2, 9);
		expect(p.netApyPercent).toBeCloseTo(p.afterManagementApyPercent * 0.8, 9);
	});

	test("a losing vault pays no performance fee", () => {
		// Charging one would report a deeper loss than the vault actually
		// inflicts, and netting a negative fee back in would report a shallower
		// one. Neither is a rounding detail: the fee is simply not charged.
		const p = projectVaultApy({ ...conservative, fundingShortPercentPerHour: -0.002 });
		expect(p.netApyPercent).toBeLessThan(0);
		expect(p.performanceFeeDragPercent).toBe(0);
		expect(p.netApyPercent).toBe(p.afterManagementApyPercent);
	});

	test("negative funding is reported as negative, not as zero", () => {
		const p = projectVaultApy({ ...conservative, fundingShortPercentPerHour: -0.001 });
		expect(p.fundingPositive).toBe(false);
		expect(p.fundingAprPercent).toBeLessThan(0);
		expect(p.breakevenDays).toBeNull();
	});

	test("a thin pool's impact is charged on the way in and again on the way out", () => {
		const deep = projectVaultApy(conservative);
		const thin = projectVaultApy({ ...conservative, spotImpactPercent: -1.5 });
		expect(thin.netApyPercent).toBeLessThan(deep.netApyPercent);
		// Sign-insensitive: the caller may hand it over as a loss or a magnitude.
		const positive = projectVaultApy({ ...conservative, spotImpactPercent: 1.5 });
		expect(positive.netApyPercent).toBe(thin.netApyPercent);
	});

	test("churning the position pays the round trip more often", () => {
		const once = projectVaultApy(conservative);
		const fourTimes = projectVaultApy({ ...conservative, roundTripsPerYear: 4 });
		expect(fourTimes.roundTripDragPercent).toBeCloseTo(once.roundTripDragPercent * 4, 9);
		expect(fourTimes.netApyPercent).toBeLessThan(once.netApyPercent);
	});

	test("carries its own assumptions, so a figure can be reproduced", () => {
		const p = projectVaultApy({ ...conservative, leverage: 3, spotImpactPercent: -0.4 });
		expect(p.assumptions).toEqual({
			leverage: 3,
			deployedFraction: 0.9,
			managementFeeBps: 200,
			performanceFeeBps: 2000,
			roundTripsPerYear: 1,
			spotImpactPercent: 0.4,
		});
	});

	test("a nonsense deployed fraction is clamped rather than trusted", () => {
		expect(
			projectVaultApy({ ...conservative, deployedFraction: 4 }).assumptions.deployedFraction,
		).toBe(1);
		expect(
			projectVaultApy({ ...conservative, deployedFraction: Number.NaN }).assumptions
				.deployedFraction,
		).toBe(0);
	});

	test("zero leverage is read as unlevered rather than dividing by nothing", () => {
		const p = projectVaultApy({ ...conservative, leverage: 0 });
		expect(p.assumptions.leverage).toBe(1);
		expect(Number.isFinite(p.netApyPercent)).toBe(true);
	});
});
