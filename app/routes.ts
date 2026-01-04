import { type RouteConfig, layout } from "@react-router/dev/routes";
import { jamRoutes } from "react-router-jam";

export default [layout("root.tsx", { id: "app-root" }, await jamRoutes())] satisfies RouteConfig;
