import { Elysia } from "elysia";
import { reactRouter } from "elysia-react-router";

new Elysia().use(await reactRouter({ getLoadContext: (ctx) => ctx })).listen(3002);
