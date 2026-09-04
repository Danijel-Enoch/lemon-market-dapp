import type { RouteConfig } from "@react-router/dev/routes";
import { jamRoutes } from "react-router-jam";

export default (await jamRoutes()) satisfies RouteConfig;
