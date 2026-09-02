import type { ComponentProps } from "react";
import { Form as RemixForm, useActionData, useLoaderData, useNavigation } from "react-router";
import { twMerge } from "tailwind-merge";

type FormProps = ComponentProps<typeof RemixForm> & {
	children: React.ReactNode;
	pendingText?: string;
	disabled?: boolean;
	showMessage?: boolean;
	"data-intent"?: string;
};

export function Form({
	children,
	pendingText,
	disabled,
	showMessage = true,
	className,
	...props
}: FormProps) {
	const navigation = useNavigation();
	const dataIntent = props["data-intent"];
	const loaderData = useLoaderData<{ error: string; success: string; intent: string }>();
	const actionData = useActionData<{ error: string; success: string; intent: string }>();
	const error = actionData?.intent === dataIntent ? actionData?.error : loaderData?.error;
	const success = actionData?.intent === dataIntent ? actionData?.success : loaderData?.success;
	const isSubmitting = navigation.state === "submitting";

	return (
		<RemixForm {...props}>
			{showMessage && error && (
				<div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}
			{showMessage && success && (
				<div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
					<p className="text-sm text-green-400">{success}</p>
				</div>
			)}
			<fieldset disabled={isSubmitting || disabled} className={className}>
				{children}
			</fieldset>
		</RemixForm>
	);
}

export function SubmitButton({
	children,
	pendingText = "Submitting...",
	className = "",
	...props
}: ComponentProps<"button"> & { pendingText?: string }) {
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	return (
		<button
			type="submit"
			disabled={isSubmitting}
			className={twMerge(
				"inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			{isSubmitting ? (
				<>
					<svg
						className="h-4 w-4 animate-spin"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<title>Submitting...</title>
						<circle
							className="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							className="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						/>
					</svg>
					{pendingText}
				</>
			) : (
				children
			)}
		</button>
	);
}
