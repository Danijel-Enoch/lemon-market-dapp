"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";
import { useAccount } from "wagmi";
import { useReferral } from "@/hooks/useReferral";
import { referralService } from "@/lib/referral-service";
import { generateReferralUrl } from "@/lib/referral-utils";

/**
 * Example component showing how to use the referral system
 * This demonstrates all referral functionality
 */
export function ReferralExample() {
	const { address } = useAccount();
	const { referralCode, isLoading, error } = useReferral();
	const [copiedToClipboard, setCopiedToClipboard] = useState(false);

	const [{ loading: statsLoading, error: statsError, value: statsData }, fetchStats] =
		useAsyncFn(async () => {
			if (!address) return null;
			return await referralService.getReferralStats(address);
		}, [address]);

	const stats = useMemo(() => statsData || null, [statsData]);
	const _statsErrorMessage = statsError ? statsError.message : null;

	// Fetch referral stats
	useEffect(() => {
		if (address) {
			fetchStats();
		}
	}, [address, fetchStats]);

	const [, handleCopyReferralLink] = useAsyncFn(async () => {
		if (!referralCode) return;

		const shareUrl = generateReferralUrl(
			process.env.NEXT_PUBLIC_APP_URL || "https://app.com",
			referralCode,
		);
		await referralService.copyToClipboard(shareUrl);
		setCopiedToClipboard(true);
		setTimeout(() => setCopiedToClipboard(false), 2000);
	}, [referralCode]);

	if (!address) {
		return (
			<div className="p-4 border border-gray-300 rounded">
				<p className="text-gray-500">Connect your wallet to see referral info</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="p-4 border border-gray-300 rounded">
				<h2 className="text-xl font-bold mb-4">Your Referral Code</h2>

				{isLoading ? (
					<p className="text-gray-500">Loading referral code...</p>
				) : error ? (
					<p className="text-red-500">Error: {error}</p>
				) : referralCode ? (
					<div className="space-y-4">
						<div className="p-3 bg-gray-100 rounded font-mono text-center text-lg">
							{referralCode}
						</div>

						<button
							type="button"
							onClick={handleCopyReferralLink}
							className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
						>
							{copiedToClipboard ? "✓ Copied!" : "Copy Referral Link"}
						</button>

						<p className="text-sm text-gray-600">
							Share this code with friends to earn 100 points for each person they refer
						</p>
					</div>
				) : null}
			</div>

			<div className="p-4 border border-gray-300 rounded">
				<h2 className="text-xl font-bold mb-4">Referral Statistics</h2>

				{statsLoading ? (
					<p className="text-gray-500">Loading statistics...</p>
				) : statsError ? (
					<p className="text-red-500">Error: {statsError.message}</p>
				) : stats ? (
					<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
						<div className="p-3 bg-gray-50 rounded">
							<p className="text-sm text-gray-600">Points</p>
							<p className="text-2xl font-bold">{stats.points}</p>
						</div>
						<div className="p-3 bg-gray-50 rounded">
							<p className="text-sm text-gray-600">Total Referrals</p>
							<p className="text-2xl font-bold">{stats.totalReferrals}</p>
						</div>
						<div className="p-3 bg-gray-50 rounded">
							<p className="text-sm text-gray-600">Per Referral</p>
							<p className="text-2xl font-bold">100</p>
						</div>
						<div className="p-3 bg-gray-50 rounded">
							<p className="text-sm text-gray-600">Joined</p>
							<p className="text-xs font-bold">{new Date(stats.createdAt).toLocaleDateString()}</p>
						</div>
					</div>
				) : null}
			</div>

			{stats?.referrals && stats.referrals.length > 0 && (
				<div className="p-4 border border-gray-300 rounded">
					<h2 className="text-xl font-bold mb-4">Your Referrals</h2>

					<div className="space-y-2">
						{stats.referrals.map(
							(referral: {
								referredAddress: string;
								createdAt: string;
								pointsAwarded: boolean;
							}) => (
								<div
									key={referral.referredAddress}
									className="p-3 bg-gray-50 rounded flex justify-between items-center"
								>
									<div>
										<p className="font-mono text-sm">
											{referral.referredAddress.slice(0, 6)}
											...
											{referral.referredAddress.slice(-4)}
										</p>
										<p className="text-xs text-gray-600">
											{new Date(referral.createdAt).toLocaleDateString()}
										</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-bold text-green-600">+100 points</p>
										{referral.pointsAwarded && <p className="text-xs text-gray-600">✓ Awarded</p>}
									</div>
								</div>
							),
						)}
					</div>
				</div>
			)}

			<div className="p-4 bg-blue-50 border border-blue-200 rounded">
				<h3 className="font-bold text-blue-900 mb-2">How it works</h3>
				<ul className="text-sm text-blue-800 space-y-1">
					<li>• Share your referral code with friends</li>
					<li>• Each friend who joins earns you 100 points</li>
					<li>• Their referral code is saved automatically</li>
					<li>• You cannot refer yourself</li>
					<li>• All referrals are permanent and cannot be changed</li>
				</ul>
			</div>
		</div>
	);
}
