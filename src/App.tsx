import { useEffect } from "react";
import {
	Route,
	BrowserRouter as Router,
	Routes,
	useLocation
} from "react-router-dom";
import ViewLayout from "./app/(view)/layout";
import { PostHogProvider } from "posthog-js/react";
import Layout from "./app/layout";
import NotFound from "./app/not-found";
import HomePage, { metadata as homeMetadata } from "./app/page";
import type { Metadata } from "./lib/types";

// Type for page modules
type PageModule = {
	default: React.ComponentType;
	metadata?: Metadata;
};
const options = {
	api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
	defaults: "2025-11-30"
} as const;
// MetadataSetter component
function MetadataSetter({
	metadataMap
}: {
	metadataMap: Record<string, Metadata>;
}) {
	const location = useLocation();

	useEffect(() => {
		const metadata = metadataMap[location.pathname];
		if (metadata) {
			if (metadata.title) {
				document.title = metadata.title;
			}
			if (metadata.description) {
				const metaDesc = document.querySelector(
					'meta[name="description"]'
				);
				if (metaDesc) {
					metaDesc.setAttribute("content", metadata.description);
				} else {
					const newMeta = document.createElement("meta");
					newMeta.name = "description";
					newMeta.content = metadata.description;
					document.head.appendChild(newMeta);
				}
			}
			if (metadata.openGraph) {
				const og = metadata.openGraph;
				if (og.title) {
					setMetaTag("property", "og:title", og.title);
				}
				if (og.description) {
					setMetaTag("property", "og:description", og.description);
				}
				if (og.images && og.images.length > 0) {
					// Remove existing og:image tags
					const existingImages = document.querySelectorAll(
						'meta[property="og:image"]'
					);
					for (let i = 0; i < existingImages.length; i++) {
						existingImages[i].remove();
					}
					// Add new ones
					og.images.forEach((image) => {
						const meta = document.createElement("meta");
						meta.setAttribute("property", "og:image");
						meta.content = image;
						document.head.appendChild(meta);
					});
				}
			}
			if (metadata.other) {
				Object.entries(metadata.other).forEach(([name, content]) => {
					setMetaTag("name", name, content);
				});
			}
		}
	}, [location.pathname, metadataMap]);

	return null;
}

// Helper function to set or update meta tags
function setMetaTag(attr: string, value: string, content: string) {
	const selector = `meta[${attr}="${value}"]`;
	let meta = document.querySelector(selector) as HTMLMetaElement;
	if (meta) {
		meta.content = content;
	} else {
		meta = document.createElement("meta");
		meta.setAttribute(attr, value);
		meta.content = content;
		document.head.appendChild(meta);
	}
}

// Dynamically import all page components
const pageModules = import.meta.glob("./app/**/page.tsx", {
	eager: true
}) as Record<string, PageModule>;

// Function to generate routes from file structure
function generateRoutes() {
	const routes = [];
	const metadataMap: Record<string, Metadata> = {};

	// Handle root page separately
	routes.push({
		path: "/",
		element: (
			<Layout>
				<HomePage />
			</Layout>
		)
	});
	metadataMap["/"] = homeMetadata;

	// Process other pages
	for (const [path, module] of Object.entries(pageModules)) {
		// Skip the root page.tsx
		if (path === "./app/page.tsx") continue;

		// Extract route path from file path
		// e.g., './app/(view)/dashboard/page.tsx' -> '/dashboard'
		const routePath =
			path
				.replace("./app", "") // remove './app'
				.replace("/page.tsx", "") // remove '/page.tsx'
				.replace(/\/\([^)]+\)/g, "") || // remove route groups like /(view)
			"/"; // fallback to '/'

		// Determine which layout to use
		const useViewLayout = path.includes("(view)");

		const Component = module.default;

		// Collect metadata
		if (module.metadata) {
			metadataMap[routePath] = module.metadata;
		}

		routes.push({
			path: routePath,
			element: useViewLayout ? (
				<Layout>
					<ViewLayout>
						<Component />
					</ViewLayout>
				</Layout>
			) : (
				<Layout>
					<Component />
				</Layout>
			)
		});
	}

	// Add not-found route
	routes.push({
		path: "*",
		element: (
			<Layout>
				<NotFound />
			</Layout>
		)
	});

	return { routes, metadataMap };
}

function App() {
	const { routes, metadataMap } = generateRoutes();

	return (
		<PostHogProvider
			apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY!}
			options={options}
		>
			<Router>
				<MetadataSetter metadataMap={metadataMap} />
				<Routes>
					{routes.map((route) => (
						<Route
							key={route.path}
							path={route.path}
							element={route.element}
						/>
					))}
				</Routes>
			</Router>
		</PostHogProvider>
	);
}

export default App;
