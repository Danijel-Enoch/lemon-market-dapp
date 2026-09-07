import type { Advice, AdviceRequest, Advisor } from "./policy";

/**
 * The OpenRouter advisor.
 *
 * It is handed a description of the vault and a closed list of actions the
 * policy has already cleared, and asked which one. It cannot supply an amount,
 * cannot name an action outside the list, and cannot be the reason anything
 * happens that the policy would not have permitted anyway — `decide()` re-checks
 * the answer.
 *
 * What it is genuinely useful for is the judgement the policy cannot express in
 * a threshold: funding has been positive but is flattening, the spot pool is
 * thinner than usual this hour, a redemption is eligible but not urgent and the
 * position is mid-drawdown. Those are the calls where a rule either fires too
 * early or too late, and where "wait one more tick" is often right.
 *
 * Temperature is zero and the response is a fixed JSON shape. Two identical
 * situations should produce the same answer, because an agent whose decisions
 * are irreproducible cannot be reviewed after the fact.
 */
export interface AdvisorOptions {
	apiKey: string;
	model?: string;
	baseUrl?: string;
	/** Beyond this, the tick proceeds on the policy's own first choice. */
	timeoutMs?: number;
	referer?: string;
	title?: string;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function createOpenRouterAdvisor(options: AdvisorOptions): Advisor {
	const baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1";
	const model = options.model ?? DEFAULT_MODEL;
	const timeoutMs = options.timeoutMs ?? 20_000;

	return async (request: AdviceRequest): Promise<Advice> => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(`${baseUrl}/chat/completions`, {
				method: "POST",
				signal: controller.signal,
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${options.apiKey}`,
					...(options.referer ? { "http-referer": options.referer } : {}),
					...(options.title ? { "x-title": options.title } : {}),
				},
				body: JSON.stringify({
					model,
					temperature: 0,
					max_tokens: 400,
					response_format: { type: "json_object" },
					messages: [
						{ role: "system", content: SYSTEM_PROMPT },
						{ role: "user", content: renderSituation(request) },
					],
				}),
			});

			if (!response.ok) {
				throw new Error(`OpenRouter answered ${response.status}: ${await response.text()}`);
			}

			const body = (await response.json()) as {
				choices?: { message?: { content?: string } }[];
			};
			const content = body.choices?.[0]?.message?.content;
			if (!content) throw new Error("OpenRouter returned no content");

			const parsed = JSON.parse(content) as {
				action?: string;
				market?: string;
				rationale?: string;
			};
			const action = String(parsed.action ?? "").toUpperCase();
			const market = parsed.market ? String(parsed.market).toUpperCase() : null;

			// Validated here as well as in `decide`. Two checks because this one
			// can say *why* it was rejected, and the caller's cannot.
			if (!request.options.some((o) => o.kind === action)) {
				throw new Error(`Model chose "${action}", which is not among ${describeOptions(request)}`);
			}

			// A named market has to be one the same action was offered for. An
			// answer of "REBALANCE NVDA" when only BTC was drifted is not a near
			// miss to be rounded to BTC — it is an answer about a position the model
			// has misread, and quietly retargeting it would execute a trade nobody
			// chose.
			if (market && !request.options.some((o) => o.kind === action && o.market === market)) {
				throw new Error(
					`Model chose "${action} ${market}", which is not among ${describeOptions(request)}`,
				);
			}

			return {
				kind: action as Advice["kind"],
				market,
				rationale: String(parsed.rationale ?? "").slice(0, 500) || "No rationale given.",
				fellBack: false,
			};
		} finally {
			clearTimeout(timer);
		}
	};
}

const SYSTEM_PROMPT = `You are the timing advisor for a delta-neutral basis trading vault.

The vault holds long spot positions and equal-notional short perpetuals against them, and earns funding. It may run several markets at once, each with its own spot leg and its own short, sharing one margin account. A separate policy engine has already decided which actions are safe and sized them. Your only job is to choose which of the offered actions to take right now.

Rules:
- Choose exactly one action, from the list given. Never invent one.
- Where an action names a market, answer with that market too. Options of the same kind for different markets are different actions, and an unnamed one is read as the first on the list.
- You cannot change any amount, or which markets an action applies to. Sizes and targets are fixed by the policy.
- Prefer HOLD when nothing is urgent and conditions are poor. Doing nothing is a real and often correct answer; every trade costs roughly 0.2% of notional per leg round trip.
- Never delay an UNWIND when redemptions are eligible. People are waiting on that money. Only choose against it if another listed action is strictly more urgent.
- A negative funding rate means the position is paying rather than earning. That argues against DEPLOY, not for panic.
- Auto-deleveraging risk is the venue's ability to close the short without warning. It rises as the short *wins*, because only profitable positions are taken — so a high reading means the hedge may be removed exactly when the spot leg is falling and the hedge is what is protecting depositors. You cannot reduce it; leverage is fixed by the vault's mandate. Treat a high reading as a reason to prefer keeping capital free — favour HOLD over DEPLOY, and do not delay an UNWIND on account of it.

Answer with JSON only: {"action": "<ACTION>", "market": "<TICKER or null>", "rationale": "<one or two sentences>"}`;

/**
 * Describe the situation in prose rather than as a JSON dump.
 *
 * Units are spelled out — dollars, percent per hour, hours remaining — because a
 * model handed `1250000000` and a field name will sometimes read it as dollars.
 * Every number here is formatted at the boundary; none of them come back.
 */
function renderSituation(request: AdviceRequest): string {
	const { snapshot: s, options, now } = request;
	const usd = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;

	const deadline =
		s.earliestDeadline === null
			? "none pending"
			: `${((s.earliestDeadline - now) / 3600).toFixed(1)} hours away`;

	return [
		`Vault ${s.address} (${s.riskTier.toLowerCase()}, target ${(s.targetLeverageBps / 10_000).toFixed(1)}x).`,
		"",
		`Assets: ${usd(s.totalAssets)} total, ${usd(s.deployedAssets)} deployed, ${usd(s.freeAssets)} idle.`,
		`Redemptions: ${usd(s.ripeRedeemAssets)} eligible now, ${usd(s.pendingRedeemAssets)} still in the delay window. Nearest deadline ${deadline}.`,
		"",
		// One block per market rather than one line per field, because the fields
		// only mean anything together: a drifted hedge in a market that cannot be
		// sold today is a different situation from the same drift in one that can,
		// and interleaving them by field would hide which is which.
		`Markets (${s.markets.length}):`,
		...s.markets.flatMap((m) => [
			`- ${m.ticker} (${m.symbol}), target share ${(m.targetWeightBps / 100).toFixed(1)}%, currently holding ${usd(m.spotValueUsdc)} of spot.`,
			`  Funding on the short side: ${m.fundingShortPercentPerHour.toFixed(4)}% per hour (${(m.fundingShortPercentPerHour * 24 * 365).toFixed(2)}% annualised).`,
			`  Hedge: ${m.spotUnits} spot units against ${m.perpUnits} perp units.`,
			`  Spot leg is ${m.spotBuyable ? "buyable" : "not buyable"} and ${m.spotSellable ? "sellable" : "not sellable"}.`,
			`  Auto-deleveraging: ${m.adl.summary}`,
		]),
		"",
		"Permitted actions:",
		...options.map(
			(o) =>
				`- ${o.kind}${o.market ? ` ${o.market}` : ""}${o.amount > 0n ? ` (${usd(o.amount)})` : ""}: ${o.reason}`,
		),
	].join("\n");
}

/** The option list as the answer would have to name it, for a rejection message. */
function describeOptions(request: AdviceRequest): string {
	return request.options.map((o) => `${o.kind}${o.market ? ` ${o.market}` : ""}`).join(", ");
}

/** Null when unconfigured, so the agent runs on policy alone rather than not at all. */
export function advisorFromEnv(): Advisor | null {
	const apiKey = process.env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return null;

	return createOpenRouterAdvisor({
		apiKey,
		model: process.env.OPENROUTER_MODEL?.trim(),
		referer: process.env.OPENROUTER_REFERER?.trim(),
		title: "Lemon Vault Agent",
	});
}
