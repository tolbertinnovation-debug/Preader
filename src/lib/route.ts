import "server-only";
import { errorResponse } from "./http";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler so every thrown error becomes a safe JSON response. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
